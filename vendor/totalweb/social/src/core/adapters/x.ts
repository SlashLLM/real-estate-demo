import { basicAuth, expiresAt, fetchBytes, request, requestJson } from "../http.ts";
import { PlatformError, type AccountContext, type AppCredentials, type PlatformAdapter, type PostMetrics } from "../types.ts";

const AUTH = "https://x.com/i/oauth2/authorize";
const API = "https://api.x.com/2";
const SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access", "media.write"];
const CHUNK = 4 * 1024 * 1024;

/** X API v2: OAuth 2.0 PKCE, v2 media upload (chunked for video), public_metrics. */
export function x(app: AppCredentials): PlatformAdapter {
  const tokenRequest = (form: Record<string, string | undefined>) =>
    requestJson(`${API}/oauth2/token`, {
      method: "POST",
      headers: { Authorization: basicAuth(app.clientId, app.clientSecret) },
      form: { ...form, client_id: app.clientId },
    });

  const toTokens = (t: any) => ({
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: expiresAt(t.expires_in),
    scope: t.scope,
  });

  async function uploadMedia(account: AccountContext, url: string, kind: "image" | "video") {
    const { bytes, mime } = await fetchBytes(url);
    const bearer = account.tokens.accessToken;
    const category = kind === "video" ? "tweet_video" : "tweet_image";

    if (kind === "image" && bytes.length <= 5 * 1024 * 1024) {
      const form = new FormData();
      form.append("media", new Blob([bytes], { type: mime }));
      form.append("media_category", category);
      const res = await requestJson(`${API}/media/upload`, { method: "POST", bearer, body: form });
      return res.data.id as string;
    }

    const init = await requestJson(`${API}/media/upload/initialize`, {
      method: "POST",
      bearer,
      json: { media_type: mime, total_bytes: bytes.length, media_category: category },
    });
    const id = init.data.id as string;
    for (let i = 0, seg = 0; i < bytes.length; i += CHUNK, seg++) {
      const form = new FormData();
      form.append("media", new Blob([bytes.subarray(i, i + CHUNK)]));
      form.append("segment_index", String(seg));
      await request(`${API}/media/upload/${id}/append`, { method: "POST", bearer, body: form });
    }
    let info = (await requestJson(`${API}/media/upload/${id}/finalize`, { method: "POST", bearer })).data;
    // Videos transcode asynchronously; poll until succeeded.
    for (let i = 0; info.processing_info && info.processing_info.state !== "succeeded" && i < 40; i++) {
      if (info.processing_info.state === "failed") throw new PlatformError(`X media processing failed`, 422, false, info);
      await new Promise((r) => setTimeout(r, (info.processing_info.check_after_secs ?? 3) * 1000));
      info = (await requestJson(`${API}/media/upload`, { bearer, query: { command: "STATUS", media_id: id } })).data;
    }
    return id;
  }

  return {
    key: "x",
    usesPkce: true,

    authorizeUrl: ({ state, redirectUri, codeChallenge }) =>
      `${AUTH}?${new URLSearchParams({
        response_type: "code",
        client_id: app.clientId,
        redirect_uri: redirectUri,
        scope: SCOPES.join(" "),
        state,
        code_challenge: codeChallenge!,
        code_challenge_method: "S256",
      })}`,

    async exchangeCode({ code, redirectUri, codeVerifier }) {
      const tokens = toTokens(
        await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: codeVerifier }),
      );
      const { data: me } = await requestJson(`${API}/users/me`, {
        bearer: tokens.accessToken,
        query: { "user.fields": "profile_image_url,public_metrics" },
      });
      return [{ externalId: me.id, name: me.name, username: me.username, avatarUrl: me.profile_image_url, tokens }];
    },

    async refresh(tokens) {
      if (!tokens.refreshToken) throw new PlatformError("No refresh token", 401, false);
      return toTokens(await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }));
    },

    async publish(account, input) {
      const mediaIds: string[] = [];
      for (const m of input.media.slice(0, 4)) mediaIds.push(await uploadMedia(account, m.url, m.kind));
      const { data } = await requestJson(`${API}/tweets`, {
        method: "POST",
        bearer: account.tokens.accessToken,
        json: { text: input.text, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) },
      });
      const handle = (account.settings.username as string) ?? "i";
      return { externalId: data.id, url: `https://x.com/${handle}/status/${data.id}`, status: "published" };
    },

    async fetchPostMetrics(account, ids) {
      const out: Record<string, PostMetrics> = {};
      for (let i = 0; i < ids.length; i += 100) {
        const { data = [] } = await requestJson(`${API}/tweets`, {
          bearer: account.tokens.accessToken,
          query: { ids: ids.slice(i, i + 100).join(","), "tweet.fields": "public_metrics" },
        });
        for (const t of data) {
          const m = t.public_metrics ?? {};
          out[t.id] = {
            impressions: m.impression_count,
            likes: m.like_count,
            comments: m.reply_count,
            shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
            saves: m.bookmark_count,
            raw: m,
          };
        }
      }
      return out;
    },

    async fetchAccountMetrics(account) {
      const { data } = await requestJson(`${API}/users/me`, {
        bearer: account.tokens.accessToken,
        query: { "user.fields": "public_metrics" },
      });
      const m = data.public_metrics ?? {};
      return { followers: m.followers_count, following: m.following_count, postsCount: m.tweet_count, raw: m };
    },
  };
}
