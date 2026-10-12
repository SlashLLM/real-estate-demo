import { expiresAt, requestJson } from "../http.ts";
import {
  PlatformError,
  type AccountContext,
  type AppCredentials,
  type ConnectedAccount,
  type PlatformAdapter,
  type PostMetrics,
} from "../types.ts";

export const GRAPH_VERSION = "v23.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DIALOG = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

const FB_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "read_insights", "business_management"];
const IG_SCOPES = [...FB_SCOPES, "instagram_basic", "instagram_content_publish", "instagram_manage_insights"];

/**
 * Shared Facebook Login flow. The user token is exchanged for a long-lived token, and each
 * Page's own (non-expiring) page token is stored per account.
 */
async function connectPages(app: AppCredentials, code: string, redirectUri: string) {
  const short = await requestJson(`${GRAPH}/oauth/access_token`, {
    query: { client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: redirectUri, code },
  });
  const long = await requestJson(`${GRAPH}/oauth/access_token`, {
    query: {
      grant_type: "fb_exchange_token",
      client_id: app.clientId,
      client_secret: app.clientSecret,
      fb_exchange_token: short.access_token,
    },
  });
  const { data = [] } = await requestJson(`${GRAPH}/me/accounts`, {
    query: {
      access_token: long.access_token,
      fields: "id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}",
      limit: 100,
    },
  });
  return { pages: data as any[], userToken: long.access_token as string, userExpires: expiresAt(long.expires_in) };
}

const dialogUrl = (app: AppCredentials, scopes: string[], state: string, redirectUri: string) =>
  `${DIALOG}?${new URLSearchParams({
    client_id: app.clientId,
    redirect_uri: redirectUri,
    state,
    scope: scopes.join(","),
    response_type: "code",
  })}`;

/** Polls an async container/video until ready. */
async function waitFor(check: () => Promise<{ done: boolean; error?: string }>, { tries = 30, delayMs = 4000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const s = await check();
    if (s.error) throw new PlatformError(s.error, 422, false);
    if (s.done) return;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new PlatformError("Timed out waiting for media processing", 504, true);
}

// ---------------------------------------------------------------------------
// Facebook Pages
// ---------------------------------------------------------------------------
export function facebook(app: AppCredentials): PlatformAdapter {
  const token = (a: AccountContext) => a.tokens.accessToken;

  return {
    key: "facebook",
    usesPkce: false,
    authorizeUrl: ({ state, redirectUri }) => dialogUrl(app, FB_SCOPES, state, redirectUri),

    async exchangeCode({ code, redirectUri }) {
      const { pages } = await connectPages(app, code, redirectUri);
      return pages.map(
        (p): ConnectedAccount => ({
          externalId: p.id,
          name: p.name,
          avatarUrl: p.picture?.data?.url,
          tokens: { accessToken: p.access_token }, // page tokens from a long-lived user token don't expire
        }),
      );
    },

    async publish(account, input) {
      const page = account.externalId;
      const video = input.media.find((m) => m.kind === "video");
      const image = input.media.find((m) => m.kind === "image");
      let res: any;
      if (video) {
        res = await requestJson(`${GRAPH}/${page}/videos`, {
          method: "POST",
          form: { access_token: token(account), file_url: video.url, description: input.text, title: input.title },
        });
        return { externalId: res.id, url: `https://www.facebook.com/${page}/videos/${res.id}`, status: "published" };
      }
      if (image) {
        res = await requestJson(`${GRAPH}/${page}/photos`, {
          method: "POST",
          form: { access_token: token(account), url: image.url, caption: input.text },
        });
        const id = res.post_id ?? res.id;
        return { externalId: id, url: `https://www.facebook.com/${id}`, status: "published" };
      }
      res = await requestJson(`${GRAPH}/${page}/feed`, {
        method: "POST",
        form: { access_token: token(account), message: input.text, link: input.link },
      });
      return { externalId: res.id, url: `https://www.facebook.com/${res.id}`, status: "published" };
    },

    async fetchPostMetrics(account, ids) {
      const out: Record<string, PostMetrics> = {};
      for (let i = 0; i < ids.length; i += 50) {
        const data = await requestJson(`${GRAPH}/`, {
          query: {
            ids: ids.slice(i, i + 50).join(","),
            fields: "reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares",
            access_token: token(account),
          },
        });
        for (const [id, p] of Object.entries<any>(data)) {
          out[id] = {
            likes: p.reactions?.summary?.total_count,
            comments: p.comments?.summary?.total_count,
            shares: p.shares?.count ?? 0,
            raw: p,
          };
        }
      }
      return out;
    },

    async fetchAccountMetrics(account) {
      const p = await requestJson(`${GRAPH}/${account.externalId}`, {
        query: { fields: "followers_count,fan_count", access_token: token(account) },
      });
      return { followers: p.followers_count ?? p.fan_count, raw: p };
    },
  };
}

// ---------------------------------------------------------------------------
// Instagram (Business/Creator via Facebook Login + Content Publishing API)
// ---------------------------------------------------------------------------
export function instagram(app: AppCredentials): PlatformAdapter {
  const token = (a: AccountContext) => a.tokens.accessToken;

  async function container(account: AccountContext, params: Record<string, string | undefined>) {
    const res = await requestJson(`${GRAPH}/${account.externalId}/media`, {
      method: "POST",
      form: { ...params, access_token: token(account) },
    });
    return res.id as string;
  }

  async function waitReady(account: AccountContext, id: string) {
    await waitFor(async () => {
      const s = await requestJson(`${GRAPH}/${id}`, { query: { fields: "status_code,status", access_token: token(account) } });
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED") return { done: false, error: `Instagram media ${s.status_code}: ${s.status}` };
      return { done: s.status_code === "FINISHED" };
    });
  }

  async function publishContainer(account: AccountContext, creationId: string) {
    const published = await requestJson(`${GRAPH}/${account.externalId}/media_publish`, {
      method: "POST",
      form: { creation_id: creationId, access_token: token(account) },
    });
    const info = await requestJson(`${GRAPH}/${published.id}`, { query: { fields: "permalink", access_token: token(account) } });
    return { externalId: published.id as string, url: info.permalink as string, status: "published" as const };
  }

  return {
    key: "instagram",
    usesPkce: false,
    authorizeUrl: ({ state, redirectUri }) => dialogUrl(app, IG_SCOPES, state, redirectUri),

    async exchangeCode({ code, redirectUri }) {
      const { pages } = await connectPages(app, code, redirectUri);
      return pages
        .filter((p) => p.instagram_business_account)
        .map(
          (p): ConnectedAccount => ({
            externalId: p.instagram_business_account.id,
            name: p.instagram_business_account.name ?? p.instagram_business_account.username,
            username: p.instagram_business_account.username,
            avatarUrl: p.instagram_business_account.profile_picture_url,
            tokens: { accessToken: p.access_token },
            settings: { page_id: p.id },
          }),
        );
    },

    async publish(account, input) {
      if (!input.media.length) throw new PlatformError("Instagram requires media", 400, false);
      let creationId: string;
      if (input.media.length > 1) {
        const children: string[] = [];
        for (const m of input.media) {
          children.push(
            await container(account, m.kind === "video" ? { media_type: "VIDEO", video_url: m.url, is_carousel_item: "true" } : { image_url: m.url, is_carousel_item: "true" }),
          );
        }
        for (const c of children) await waitReady(account, c);
        creationId = await container(account, { media_type: "CAROUSEL", children: children.join(","), caption: input.text });
      } else {
        const m = input.media[0];
        creationId = await container(
          account,
          m.kind === "video"
            ? { media_type: "REELS", video_url: m.url, caption: input.text, share_to_feed: "true" }
            : { image_url: m.url, caption: input.text },
        );
      }
      // Videos/Reels can take minutes to transcode: hand back a container id and let the
      // publisher finish via checkStatus on a later tick instead of blocking the worker.
      if (input.media.some((m) => m.kind === "video")) {
        return { externalId: `container:${creationId}`, status: "processing" };
      }
      await waitReady(account, creationId);
      return publishContainer(account, creationId);
    },

    async checkStatus(account, externalId) {
      if (!externalId.startsWith("container:")) return { externalId, status: "published" };
      const creationId = externalId.slice("container:".length);
      const s = await requestJson(`${GRAPH}/${creationId}`, { query: { fields: "status_code,status", access_token: token(account) } });
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED") return { status: "failed", error: `Instagram media ${s.status_code}: ${s.status}` };
      if (s.status_code !== "FINISHED") return { externalId, status: "processing" };
      return publishContainer(account, creationId);
    },

    async fetchPostMetrics(account, ids) {
      const out: Record<string, PostMetrics> = {};
      for (const id of ids) {
        const base = await requestJson(`${GRAPH}/${id}`, {
          query: { fields: "like_count,comments_count,media_product_type", access_token: token(account) },
        });
        let insights: Record<string, number> = {};
        try {
          const { data = [] } = await requestJson(`${GRAPH}/${id}/insights`, {
            query: { metric: "reach,saved,shares,views,total_interactions", access_token: token(account) },
            retries: 1,
          });
          insights = Object.fromEntries(data.map((m: any) => [m.name, m.values?.[0]?.value ?? m.total_value?.value]));
        } catch {
          // Insights are unavailable for some media types / young posts; keep base counts.
        }
        out[id] = {
          likes: base.like_count,
          comments: base.comments_count,
          reach: insights.reach,
          saves: insights.saved,
          shares: insights.shares,
          views: insights.views,
          raw: { ...base, insights },
        };
      }
      return out;
    },

    async fetchAccountMetrics(account) {
      const p = await requestJson(`${GRAPH}/${account.externalId}`, {
        query: { fields: "followers_count,follows_count,media_count", access_token: token(account) },
      });
      return { followers: p.followers_count, following: p.follows_count, postsCount: p.media_count, raw: p };
    },
  };
}
