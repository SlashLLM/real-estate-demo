import { expiresAt, requestJson } from "../http.ts";
import { PlatformError, type AppCredentials, type PlatformAdapter, type PostMetrics } from "../types.ts";

const AUTH = "https://threads.net/oauth/authorize";
const GRAPH = "https://graph.threads.net/v1.0";
const SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"];

async function waitFinished(token: string, creationId: string) {
  for (let i = 0; i < 20; i++) {
    const s = await requestJson(`${GRAPH}/${creationId}`, { query: { fields: "status,error_message", access_token: token } });
    if (s.status === "FINISHED") return;
    if (s.status === "ERROR" || s.status === "EXPIRED") throw new PlatformError(`Threads media ${s.status}: ${s.error_message ?? ""}`, 422, false);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new PlatformError("Timed out waiting for Threads media", 504, true);
}

async function publishContainer(token: string, creationId: string) {
  const { id } = await requestJson(`${GRAPH}/me/threads_publish`, { method: "POST", form: { creation_id: creationId, access_token: token } });
  const info = await requestJson(`${GRAPH}/${id}`, { query: { fields: "permalink", access_token: token } });
  return { externalId: id as string, url: info.permalink as string, status: "published" as const };
}

/** Threads API: two-step container → publish, long-lived 60-day tokens with refresh. */
export function threads(app: AppCredentials): PlatformAdapter {
  return {
    key: "threads",
    usesPkce: false,

    authorizeUrl: ({ state, redirectUri }) =>
      `${AUTH}?${new URLSearchParams({
        client_id: app.clientId,
        redirect_uri: redirectUri,
        scope: SCOPES.join(","),
        response_type: "code",
        state,
      })}`,

    async exchangeCode({ code, redirectUri }) {
      const short = await requestJson("https://graph.threads.net/oauth/access_token", {
        method: "POST",
        form: {
          client_id: app.clientId,
          client_secret: app.clientSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        },
      });
      const long = await requestJson("https://graph.threads.net/access_token", {
        query: { grant_type: "th_exchange_token", client_secret: app.clientSecret, access_token: short.access_token },
      });
      const me = await requestJson(`${GRAPH}/me`, {
        query: { fields: "id,username,name,threads_profile_picture_url", access_token: long.access_token },
      });
      return [
        {
          externalId: me.id,
          name: me.name ?? me.username,
          username: me.username,
          avatarUrl: me.threads_profile_picture_url,
          tokens: { accessToken: long.access_token, expiresAt: expiresAt(long.expires_in) },
        },
      ];
    },

    async refresh(tokens) {
      const t = await requestJson("https://graph.threads.net/refresh_access_token", {
        query: { grant_type: "th_refresh_token", access_token: tokens.accessToken },
      });
      return { accessToken: t.access_token, expiresAt: expiresAt(t.expires_in) };
    },

    async publish(account, input) {
      const token = account.tokens.accessToken;
      const m = input.media[0];
      const params: Record<string, string | undefined> = m
        ? m.kind === "video"
          ? { media_type: "VIDEO", video_url: m.url, text: input.text }
          : { media_type: "IMAGE", image_url: m.url, text: input.text }
        : { media_type: "TEXT", text: input.text };
      const { id: creationId } = await requestJson(`${GRAPH}/me/threads`, {
        method: "POST",
        form: { ...params, access_token: token },
      });

      if (m?.kind === "video") return { externalId: `container:${creationId}`, status: "processing" };
      if (m) await waitFinished(token, creationId);
      return publishContainer(token, creationId);
    },

    async checkStatus(account, externalId) {
      if (!externalId.startsWith("container:")) return { externalId, status: "published" };
      const creationId = externalId.slice("container:".length);
      const token = account.tokens.accessToken;
      const s = await requestJson(`${GRAPH}/${creationId}`, { query: { fields: "status,error_message", access_token: token } });
      if (s.status === "ERROR" || s.status === "EXPIRED") return { status: "failed", error: `Threads media ${s.status}: ${s.error_message ?? ""}` };
      if (s.status !== "FINISHED") return { externalId, status: "processing" };
      return publishContainer(token, creationId);
    },

    async fetchPostMetrics(account, ids) {
      const out: Record<string, PostMetrics> = {};
      for (const id of ids) {
        const { data = [] } = await requestJson(`${GRAPH}/${id}/insights`, {
          query: { metric: "views,likes,replies,reposts,quotes,shares", access_token: account.tokens.accessToken },
        });
        const v = Object.fromEntries(data.map((m: any) => [m.name, m.values?.[0]?.value ?? m.total_value?.value ?? 0]));
        out[id] = {
          views: v.views,
          likes: v.likes,
          comments: v.replies,
          shares: (v.reposts ?? 0) + (v.quotes ?? 0) + (v.shares ?? 0),
          raw: v,
        };
      }
      return out;
    },

    async fetchAccountMetrics(account) {
      const { data = [] } = await requestJson(`${GRAPH}/me/threads_insights`, {
        query: { metric: "followers_count", access_token: account.tokens.accessToken },
      });
      const followers = data.find((m: any) => m.name === "followers_count");
      return { followers: followers?.total_value?.value, raw: data };
    },
  };
}
