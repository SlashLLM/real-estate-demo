import { expiresAt, fetchBytes, request, requestJson } from "../http.ts";
import { PlatformError, type AppCredentials, type PlatformAdapter, type PostMetrics, type TokenSet } from "../types.ts";

const AUTH = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";
const SCOPES = ["user.info.basic", "user.info.stats", "video.publish", "video.list"];
const CHUNK = 10 * 1024 * 1024;

/**
 * TikTok Content Posting API (direct post). Unaudited apps can only post with SELF_ONLY privacy;
 * the adapter falls back to that automatically when the creator's allowed levels exclude the request.
 */
export function tiktok(app: AppCredentials): PlatformAdapter {
  const toTokens = (t: any): TokenSet => ({
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: expiresAt(t.expires_in),
    scope: t.scope,
    extra: { open_id: t.open_id },
  });

  const unwrap = (res: any) => {
    if (res.error && res.error.code !== "ok") throw new PlatformError(`TikTok: ${res.error.message || res.error.code}`, 400, false, res);
    return res.data;
  };

  return {
    key: "tiktok",
    usesPkce: true,

    authorizeUrl: ({ state, redirectUri, codeChallenge }) =>
      `${AUTH}?${new URLSearchParams({
        client_key: app.clientId,
        response_type: "code",
        scope: SCOPES.join(","),
        redirect_uri: redirectUri,
        state,
        code_challenge: codeChallenge!,
        code_challenge_method: "S256",
      })}`,

    async exchangeCode({ code, redirectUri, codeVerifier }) {
      const t = await requestJson(`${API}/oauth/token/`, {
        method: "POST",
        form: {
          client_key: app.clientId,
          client_secret: app.clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        },
      });
      const tokens = toTokens(t);
      const { user } = unwrap(
        await requestJson(`${API}/user/info/`, {
          bearer: tokens.accessToken,
          query: { fields: "open_id,display_name,avatar_url,username" },
        }),
      );
      return [{ externalId: user.open_id, name: user.display_name, username: user.username, avatarUrl: user.avatar_url, tokens }];
    },

    async refresh(tokens) {
      const t = await requestJson(`${API}/oauth/token/`, {
        method: "POST",
        form: { client_key: app.clientId, client_secret: app.clientSecret, grant_type: "refresh_token", refresh_token: tokens.refreshToken },
      });
      return toTokens(t);
    },

    async publish(account, input) {
      const video = input.media.find((m) => m.kind === "video");
      if (!video) throw new PlatformError("TikTok requires a video", 400, false);
      const bearer = account.tokens.accessToken;
      const o = input.options;

      const creator = unwrap(await requestJson(`${API}/post/publish/creator_info/query/`, { method: "POST", bearer, json: {} }));
      const wanted = (o.privacy as string) ?? "PUBLIC_TO_EVERYONE";
      const privacy = creator.privacy_level_options?.includes(wanted) ? wanted : "SELF_ONLY";

      const { bytes } = await fetchBytes(video.url);
      const chunkSize = bytes.length <= CHUNK ? bytes.length : CHUNK;
      const totalChunks = Math.floor(bytes.length / chunkSize); // last chunk absorbs the remainder, per TikTok spec
      const init = unwrap(
        await requestJson(`${API}/post/publish/video/init/`, {
          method: "POST",
          bearer,
          json: {
            post_info: {
              title: input.text.slice(0, 2200),
              privacy_level: privacy,
              disable_comment: Boolean(o.disableComment),
              disable_duet: Boolean(o.disableDuet),
              disable_stitch: Boolean(o.disableStitch),
              is_aigc: Boolean(o.isAigc),
            },
            source_info: { source: "FILE_UPLOAD", video_size: bytes.length, chunk_size: chunkSize, total_chunk_count: totalChunks },
          },
        }),
      );
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = i === totalChunks - 1 ? bytes.length : start + chunkSize;
        await request(init.upload_url, {
          method: "PUT",
          headers: { "Content-Type": video.mime || "video/mp4", "Content-Range": `bytes ${start}-${end - 1}/${bytes.length}` },
          body: bytes.subarray(start, end),
        });
      }
      return { externalId: `publish:${init.publish_id}`, status: "processing" };
    },

    async checkStatus(account, externalId) {
      const publishId = externalId.replace(/^publish:/, "");
      const s = unwrap(
        await requestJson(`${API}/post/publish/status/fetch/`, {
          method: "POST",
          bearer: account.tokens.accessToken,
          json: { publish_id: publishId },
        }),
      );
      if (s.status === "FAILED") return { status: "failed", error: `TikTok: ${s.fail_reason}` };
      if (s.status !== "PUBLISH_COMPLETE") return { externalId, status: "processing" };
      const videoId = s.publicaly_available_post_id?.[0] ?? s.publicly_available_post_id?.[0];
      // SELF_ONLY posts have no public id; keep the publish id so the row still resolves.
      if (!videoId) return { externalId, status: "published" };
      const handle = (account.settings.username as string) ?? "";
      return { externalId: String(videoId), url: handle ? `https://www.tiktok.com/@${handle}/video/${videoId}` : undefined, status: "published" };
    },

    async fetchPostMetrics(account, ids) {
      const videoIds = ids.filter((id) => !id.startsWith("publish:"));
      const out: Record<string, PostMetrics> = {};
      for (let i = 0; i < videoIds.length; i += 20) {
        const data = unwrap(
          await requestJson(`${API}/video/query/`, {
            method: "POST",
            bearer: account.tokens.accessToken,
            query: { fields: "id,view_count,like_count,comment_count,share_count" },
            json: { filters: { video_ids: videoIds.slice(i, i + 20) } },
          }),
        );
        for (const v of data.videos ?? []) {
          out[v.id] = { views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.share_count, raw: v };
        }
      }
      return out;
    },

    async fetchAccountMetrics(account) {
      const { user } = unwrap(
        await requestJson(`${API}/user/info/`, {
          bearer: account.tokens.accessToken,
          query: { fields: "follower_count,following_count,likes_count,video_count" },
        }),
      );
      return { followers: user.follower_count, following: user.following_count, postsCount: user.video_count, raw: user };
    },
  };
}
