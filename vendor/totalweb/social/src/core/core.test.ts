import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { decryptTokens, encryptTokens, hmacHex, pkceChallenge } from "./crypto.ts";
import { PLATFORM_KEYS, supportsPostType, validateForPlatform } from "./platforms.ts";
import { draftPostType, generatedState } from "./generated.ts";
import { backoffMs } from "./publisher.ts";
import { getAdapter } from "./adapters/index.ts";
import { escapeLittleText } from "./adapters/linkedin.ts";
import { PlatformError } from "./types.ts";

const KEY = Buffer.alloc(32, 7).toString("base64");
const env = (name: string) => `test-${name}`;
const account = (extra: Record<string, unknown> = {}) => ({
  externalId: "acct-1",
  tokens: { accessToken: "tok" },
  settings: { username: "brand", ...extra },
});

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("crypto", () => {
  it("round-trips tokens and rejects tampering", async () => {
    const tokens = { accessToken: "a", refreshToken: "r", expiresAt: 123 };
    const ct = await encryptTokens(tokens, KEY);
    expect(ct.startsWith("v1:")).toBe(true);
    expect(await decryptTokens(ct, KEY)).toEqual(tokens);
    const tampered = ct.slice(0, -4) + (ct.endsWith("AAAA") ? "BBBB" : "AAAA");
    await expect(decryptTokens(tampered, KEY)).rejects.toThrow();
  });

  it("computes RFC 7636 PKCE challenge", async () => {
    // Test vector from RFC 7636 appendix B
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("produces stable HMAC hex", async () => {
    expect(await hmacHex("secret", "1.body")).toMatch(/^[0-9a-f]{64}$/);
    expect(await hmacHex("secret", "1.body")).toBe(await hmacHex("secret", "1.body"));
  });
});

describe("validateForPlatform", () => {
  it("enforces character limits and media rules", () => {
    expect(validateForPlatform("x", { text: "a".repeat(281), media: [] }).map((i) => i.message)).toEqual(["Text is 281/280 characters"]);
    expect(validateForPlatform("tiktok", { text: "hi", media: [{ kind: "image" }] }).map((i) => i.message)).toEqual(
      expect.arrayContaining(["Images are not supported"]),
    );
    expect(validateForPlatform("youtube", { text: "x", title: "", media: [{ kind: "video" }] }).map((i) => i.message)).toEqual([
      "A title is required",
    ]);
    expect(validateForPlatform("instagram", { text: "hi", media: [] }).map((i) => i.message)).toContain("Requires an image or video");
    expect(validateForPlatform("linkedin", { text: "hello", media: [] })).toEqual([]);
  });
});

describe("supportsPostType", () => {
  it("matches each platform's media rules", () => {
    const by = (t: "image" | "video" | "text") => PLATFORM_KEYS.filter((p) => supportsPostType(p, t));
    expect(by("video")).toEqual(PLATFORM_KEYS);
    expect(by("image").sort()).toEqual(["facebook", "instagram", "linkedin", "pinterest", "threads", "x"]);
    expect(by("text").sort()).toEqual(["facebook", "linkedin", "threads", "x"]);
  });
});

describe("generatedState", () => {
  it("follows the draft, then its post, then the platform's target", () => {
    expect(generatedState("pending", null, null)).toBe("review");
    expect(generatedState("rejected", { status: "published" }, null)).toBe("rejected");
    expect(generatedState("approved", null, null)).toBe("draft"); // post was deleted
    expect(generatedState("approved", { status: "draft" }, { status: "cancelled" })).toBe("draft");
    expect(generatedState("approved", { status: "scheduled" }, { status: "pending" })).toBe("scheduled");
    expect(generatedState("approved", { status: "publishing" }, { status: "processing" })).toBe("publishing");
    // Published on another platform, this one still queued
    expect(generatedState("approved", { status: "partially_published" }, { status: "pending" })).toBe("scheduled");
    expect(generatedState("approved", { status: "partially_published" }, { status: "failed" })).toBe("failed");
    expect(generatedState("approved", { status: "published" }, { status: "published" })).toBe("published");
    // The user removed this platform's target in the composer: fall back to the post
    expect(generatedState("approved", { status: "published" }, null)).toBe("published");
  });

  it("maps old free-form formats onto the three post types", () => {
    expect(draftPostType({ post_type: "text" })).toBe("text");
    expect(draftPostType({ format: "short" })).toBe("video");
    expect(draftPostType({ format: "carousel" })).toBe("image");
    expect(draftPostType(null)).toBe("image");
  });
});

describe("backoff", () => {
  it("grows exponentially and caps at one hour", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(3)).toBe(240_000);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});

describe("x adapter", () => {
  it("uploads an image then posts the tweet with media ids", async () => {
    let tweetBody: any;
    server.use(
      http.get("https://cdn.test/img.png", () => new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } })),
      http.post("https://api.x.com/2/media/upload", () => HttpResponse.json({ data: { id: "m1" } })),
      http.post("https://api.x.com/2/tweets", async ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer tok");
        tweetBody = await request.json();
        return HttpResponse.json({ data: { id: "t1" } });
      }),
    );
    const res = await getAdapter("x", env).publish(account(), {
      text: "hello",
      media: [{ url: "https://cdn.test/img.png", mime: "image/png", kind: "image" }],
      options: {},
    });
    expect(tweetBody).toEqual({ text: "hello", media: { media_ids: ["m1"] } });
    expect(res).toEqual({ externalId: "t1", url: "https://x.com/brand/status/t1", status: "published" });
  });

  it("maps public_metrics", async () => {
    server.use(
      http.get("https://api.x.com/2/tweets", () =>
        HttpResponse.json({
          data: [{ id: "t1", public_metrics: { impression_count: 100, like_count: 5, reply_count: 2, retweet_count: 1, quote_count: 1, bookmark_count: 3 } }],
        }),
      ),
    );
    const m = await getAdapter("x", env).fetchPostMetrics(account(), ["t1"]);
    expect(m.t1).toMatchObject({ impressions: 100, likes: 5, comments: 2, shares: 2, saves: 3 });
  });

  it("raises a non-retryable 401 as authExpired", async () => {
    server.use(http.post("https://api.x.com/2/tweets", () => HttpResponse.json({ title: "Unauthorized" }, { status: 401 })));
    const err = await getAdapter("x", env)
      .publish(account(), { text: "hi", media: [], options: {} })
      .catch((e) => e);
    expect(err).toBeInstanceOf(PlatformError);
    expect(err.authExpired).toBe(true);
    expect(err.retryable).toBe(false);
  });
});

describe("youtube adapter", () => {
  it("starts a resumable session and uploads the bytes", async () => {
    let meta: any;
    server.use(
      http.get("https://cdn.test/v.mp4", () => new HttpResponse(new Uint8Array(10), { headers: { "content-type": "video/mp4" } })),
      http.post("https://www.googleapis.com/upload/youtube/v3/videos", async ({ request }) => {
        meta = await request.json();
        return new HttpResponse(null, { headers: { location: "https://upload.test/session/1" } });
      }),
      http.put("https://upload.test/session/1", () => HttpResponse.json({ id: "vid1" })),
    );
    const res = await getAdapter("youtube", env).publish(account(), {
      text: "desc",
      title: "My video",
      tags: ["a"],
      media: [{ url: "https://cdn.test/v.mp4", mime: "video/mp4", kind: "video" }],
      options: { privacy: "unlisted" },
    });
    expect(meta.snippet).toMatchObject({ title: "My video", description: "desc", tags: ["a"] });
    expect(meta.status.privacyStatus).toBe("unlisted");
    expect(res.url).toBe("https://www.youtube.com/watch?v=vid1");
  });
});

describe("tiktok adapter", () => {
  it("resolves a completed publish to the public video id", async () => {
    server.use(
      http.post("https://open.tiktokapis.com/v2/post/publish/status/fetch/", () =>
        HttpResponse.json({ data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [777] }, error: { code: "ok" } }),
      ),
    );
    const res = await getAdapter("tiktok", env).checkStatus!(account(), "publish:p1");
    expect(res).toEqual({ externalId: "777", url: "https://www.tiktok.com/@brand/video/777", status: "published" });
  });
});

describe("linkedin little text", () => {
  it("escapes reserved characters", () => {
    expect(escapeLittleText("Hi (team) #launch @me")).toBe("Hi \\(team\\) {hashtag|\\#|launch} \\@me");
  });
});

describe("video format", () => {
  it("uses the ratio picked in the form over the platform's usual shape", async () => {
    const { formatForSpec } = await import("./video.ts");
    expect(formatForSpec({ aspect: "16:9" }, "youtube")).toEqual({ format: "demo", aspect: "16:9" });
    expect(formatForSpec({ aspect: "1:1" }, "tiktok")).toEqual({ format: "feed", aspect: "1:1" });
    expect(formatForSpec(null, "youtube")).toEqual({ format: "social", aspect: "9:16" });
    expect(formatForSpec({}, "linkedin")).toEqual({ format: "feed", aspect: "4:5" });
  });
});
