import { expiresAt, fetchBytes, request, requestJson } from "../http.ts";
import { PlatformError, type AppCredentials, type PlatformAdapter, type TokenSet } from "../types.ts";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

/** YouTube Data API v3: resumable video upload + statistics. */
export function youtube(app: AppCredentials): PlatformAdapter {
  const toTokens = (t: any, prev?: TokenSet): TokenSet => ({
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? prev?.refreshToken,
    expiresAt: expiresAt(t.expires_in),
    scope: t.scope,
  });

  return {
    key: "youtube",
    usesPkce: true,

    authorizeUrl: ({ state, redirectUri, codeChallenge }) =>
      `${AUTH}?${new URLSearchParams({
        client_id: app.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
        code_challenge: codeChallenge!,
        code_challenge_method: "S256",
      })}`,

    async exchangeCode({ code, redirectUri, codeVerifier }) {
      const t = await requestJson(TOKEN, {
        method: "POST",
        form: {
          code,
          client_id: app.clientId,
          client_secret: app.clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          code_verifier: codeVerifier,
        },
      });
      const tokens = toTokens(t);
      const { items = [] } = await requestJson(`${API}/channels`, {
        bearer: tokens.accessToken,
        query: { part: "snippet", mine: true },
      });
      return items.map((ch: any) => ({
        externalId: ch.id,
        name: ch.snippet.title,
        username: ch.snippet.customUrl,
        avatarUrl: ch.snippet.thumbnails?.default?.url,
        tokens,
      }));
    },

    async refresh(tokens) {
      if (!tokens.refreshToken) throw new PlatformError("No refresh token", 401, false);
      const t = await requestJson(TOKEN, {
        method: "POST",
        form: {
          client_id: app.clientId,
          client_secret: app.clientSecret,
          refresh_token: tokens.refreshToken,
          grant_type: "refresh_token",
        },
      });
      return toTokens(t, tokens);
    },

    async publish(account, input) {
      const video = input.media.find((m) => m.kind === "video");
      if (!video) throw new PlatformError("YouTube requires a video", 400, false);
      const { bytes, mime } = await fetchBytes(video.url);
      const o = input.options;

      // 1) start a resumable session with the metadata
      const init = await request(UPLOAD, {
        method: "POST",
        bearer: account.tokens.accessToken,
        query: { uploadType: "resumable", part: "snippet,status" },
        headers: { "X-Upload-Content-Type": video.mime || mime, "X-Upload-Content-Length": String(bytes.length) },
        json: {
          snippet: {
            title: (input.title || input.text.split("\n")[0] || "Untitled").slice(0, 100),
            description: input.text,
            tags: input.tags,
            categoryId: (o.categoryId as string) ?? "22",
          },
          status: {
            privacyStatus: (o.privacy as string) ?? "public",
            selfDeclaredMadeForKids: Boolean(o.madeForKids),
            ...(o.publishAt ? { publishAt: o.publishAt } : {}),
          },
        },
      });
      const location = init.headers.get("location");
      if (!location) throw new PlatformError("YouTube did not return an upload URL", 502, true);

      // 2) upload the bytes in one PUT (resumable sessions accept a single full upload)
      const res = await request(location, {
        method: "PUT",
        bearer: account.tokens.accessToken,
        headers: { "Content-Type": video.mime || mime },
        body: bytes,
        retries: 2,
      });
      const created = await res.json();
      return { externalId: created.id, url: `https://www.youtube.com/watch?v=${created.id}`, status: "published" };
    },

    async fetchPostMetrics(account, ids) {
      const out: Record<string, any> = {};
      for (let i = 0; i < ids.length; i += 50) {
        const { items = [] } = await requestJson(`${API}/videos`, {
          bearer: account.tokens.accessToken,
          query: { part: "statistics", id: ids.slice(i, i + 50).join(",") },
        });
        for (const v of items) {
          const s = v.statistics ?? {};
          out[v.id] = {
            views: num(s.viewCount),
            likes: num(s.likeCount),
            comments: num(s.commentCount),
            saves: num(s.favoriteCount),
            raw: s,
          };
        }
      }
      return out;
    },

    async fetchAccountMetrics(account) {
      const { items = [] } = await requestJson(`${API}/channels`, {
        bearer: account.tokens.accessToken,
        query: { part: "statistics", id: account.externalId },
      });
      const s = items[0]?.statistics ?? {};
      return { followers: num(s.subscriberCount), postsCount: num(s.videoCount), raw: s };
    },
  };
}

const num = (v: unknown) => (v == null ? undefined : Number(v));
