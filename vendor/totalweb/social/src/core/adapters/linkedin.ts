import { expiresAt, fetchBytes, request, requestJson } from "../http.ts";
import { PlatformError, type AccountContext, type AppCredentials, type PlatformAdapter, type PostMetrics } from "../types.ts";

const AUTH = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN = "https://www.linkedin.com/oauth/v2/accessToken";
const REST = "https://api.linkedin.com/rest";
/**
 * LinkedIn versions its REST API monthly (YYYYMM) and switches each version off about a year after release (calls then
 * fail with 426 "Requested version … is not active"). Bump this before then, or set LINKEDIN_API_VERSION to override.
 */
export const LINKEDIN_VERSION = "202608";
const SCOPES = ["openid", "profile", "email", "w_member_social"];

/** LinkedIn Posts API (member posts). Org pages need w_organization_social + an org author URN in settings. */
export function linkedin(app: AppCredentials): PlatformAdapter {
  const headers = { "LinkedIn-Version": app.apiVersion ?? LINKEDIN_VERSION, "X-Restli-Protocol-Version": "2.0.0" };
  const author = (a: AccountContext) => (a.settings.author_urn as string) ?? `urn:li:person:${a.externalId}`;

  const toTokens = (t: any) => ({
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: expiresAt(t.expires_in),
    scope: t.scope,
  });

  async function uploadImage(account: AccountContext, url: string) {
    const { value } = await requestJson(`${REST}/images?action=initializeUpload`, {
      method: "POST",
      bearer: account.tokens.accessToken,
      headers,
      json: { initializeUploadRequest: { owner: author(account) } },
    });
    const { bytes, mime } = await fetchBytes(url);
    await request(value.uploadUrl, { method: "PUT", bearer: account.tokens.accessToken, headers: { "Content-Type": mime }, body: bytes });
    return value.image as string;
  }

  async function uploadVideo(account: AccountContext, url: string) {
    const { bytes } = await fetchBytes(url);
    const { value } = await requestJson(`${REST}/videos?action=initializeUpload`, {
      method: "POST",
      bearer: account.tokens.accessToken,
      headers,
      json: { initializeUploadRequest: { owner: author(account), fileSizeBytes: bytes.length, uploadCaptions: false, uploadThumbnail: false } },
    });
    const etags: string[] = [];
    for (const part of value.uploadInstructions as { uploadUrl: string; firstByte: number; lastByte: number }[]) {
      const res = await request(part.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes.subarray(part.firstByte, part.lastByte + 1),
      });
      etags.push(res.headers.get("etag") ?? "");
    }
    await request(`${REST}/videos?action=finalizeUpload`, {
      method: "POST",
      bearer: account.tokens.accessToken,
      headers,
      json: { finalizeUploadRequest: { video: value.video, uploadToken: value.uploadToken ?? "", uploadedPartIds: etags } },
    });
    return value.video as string;
  }

  return {
    key: "linkedin",
    usesPkce: false,

    authorizeUrl: ({ state, redirectUri }) =>
      `${AUTH}?${new URLSearchParams({
        response_type: "code",
        client_id: app.clientId,
        redirect_uri: redirectUri,
        state,
        scope: SCOPES.join(" "),
      })}`,

    async exchangeCode({ code, redirectUri }) {
      const tokens = toTokens(
        await requestJson(TOKEN, {
          method: "POST",
          form: { grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: app.clientId, client_secret: app.clientSecret },
        }),
      );
      const me = await requestJson("https://api.linkedin.com/v2/userinfo", { bearer: tokens.accessToken });
      return [{ externalId: me.sub, name: me.name, avatarUrl: me.picture, tokens }];
    },

    async refresh(tokens) {
      // Refresh tokens are only issued to apps approved for programmatic refresh; otherwise users reconnect (~60 days).
      if (!tokens.refreshToken) throw new PlatformError("LinkedIn token expired; reconnect the account", 401, false);
      return toTokens(
        await requestJson(TOKEN, {
          method: "POST",
          form: { grant_type: "refresh_token", refresh_token: tokens.refreshToken, client_id: app.clientId, client_secret: app.clientSecret },
        }),
      );
    },

    async publish(account, input) {
      const m = input.media[0];
      const mediaId = m ? (m.kind === "video" ? await uploadVideo(account, m.url) : await uploadImage(account, m.url)) : undefined;
      const res = await request(`${REST}/posts`, {
        method: "POST",
        bearer: account.tokens.accessToken,
        headers,
        json: {
          author: author(account),
          commentary: escapeLittleText(input.text),
          visibility: (input.options.privacy as string) ?? "PUBLIC",
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          ...(mediaId ? { content: { media: { id: mediaId, ...(input.title ? { title: input.title } : {}) } } } : {}),
          ...(!mediaId && input.link ? { content: { article: { source: input.link, title: input.title ?? input.link } } } : {}),
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        },
      });
      const urn = res.headers.get("x-restli-id") ?? "";
      return { externalId: urn, url: `https://www.linkedin.com/feed/update/${urn}`, status: "published" };
    },

    async fetchPostMetrics(account, ids) {
      const out: Record<string, PostMetrics> = {};
      for (const urn of ids) {
        const s = await requestJson(`${REST}/socialActions/${encodeURIComponent(urn)}`, {
          bearer: account.tokens.accessToken,
          headers,
        });
        out[urn] = {
          likes: s.likesSummary?.totalLikes,
          comments: s.commentsSummary?.aggregatedTotalComments ?? s.commentsSummary?.totalFirstLevelComments,
          raw: s,
        };
      }
      return out;
    },

    async fetchAccountMetrics() {
      // Member follower counts require r_member_profileAnalytics (restricted); org pages use organizationalEntityFollowerStatistics.
      return {};
    },
  };
}

/**
 * LinkedIn "little text" reserves these characters; escape them so the post isn't rejected or truncated,
 * and turn #words into real hashtag templates.
 */
export function escapeLittleText(text: string) {
  return text
    .replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => `\\${c}`)
    .replace(/\\#([\p{L}\p{N}_]+)/gu, (_, tag) => `{hashtag|\\#|${tag}}`);
}
