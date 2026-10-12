import { basicAuth, expiresAt, fetchBytes, request, requestJson } from "../http.ts";
import { PlatformError, type AccountContext, type AppCredentials, type PlatformAdapter, type PostMetrics } from "../types.ts";

const AUTH = "https://www.pinterest.com/oauth/";
const API = "https://api.pinterest.com/v5";
const SCOPES = ["boards:read", "pins:read", "pins:write", "user_accounts:read"];

/** Pinterest API v5. The target board comes from post options or the account's default board setting. */
export function pinterest(app: AppCredentials): PlatformAdapter {
  const toTokens = (t: any) => ({
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: expiresAt(t.expires_in),
    scope: t.scope,
  });
  const tokenRequest = (form: Record<string, string | undefined>) =>
    requestJson(`${API}/oauth/token`, {
      method: "POST",
      headers: { Authorization: basicAuth(app.clientId, app.clientSecret) },
      form,
    });

  async function uploadVideo(account: AccountContext, url: string) {
    const reg = await requestJson(`${API}/media`, { method: "POST", bearer: account.tokens.accessToken, json: { media_type: "video" } });
    const { bytes, mime } = await fetchBytes(url);
    const form = new FormData();
    for (const [k, v] of Object.entries<string>(reg.upload_parameters)) form.append(k, v);
    form.append("file", new Blob([bytes], { type: mime }));
    await request(reg.upload_url, { method: "POST", body: form });
    for (let i = 0; i < 40; i++) {
      const s = await requestJson(`${API}/media/${reg.media_id}`, { bearer: account.tokens.accessToken });
      if (s.status === "succeeded") return reg.media_id as string;
      if (s.status === "failed") throw new PlatformError("Pinterest video processing failed", 422, false, s);
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new PlatformError("Timed out waiting for Pinterest video", 504, true);
  }

  return {
    key: "pinterest",
    usesPkce: false,

    authorizeUrl: ({ state, redirectUri }) =>
      `${AUTH}?${new URLSearchParams({
        client_id: app.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES.join(","),
        state,
      })}`,

    async exchangeCode({ code, redirectUri }) {
      const tokens = toTokens(await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri }));
      const me = await requestJson(`${API}/user_account`, { bearer: tokens.accessToken });
      const { items: boards = [] } = await requestJson(`${API}/boards`, { bearer: tokens.accessToken, query: { page_size: 100 } });
      return [
        {
          externalId: me.id ?? me.username,
          name: me.business_name || me.username,
          username: me.username,
          avatarUrl: me.profile_image,
          tokens,
          settings: {
            boards: boards.map((b: any) => ({ id: b.id, name: b.name })),
            default_board_id: boards[0]?.id ?? null,
          },
        },
      ];
    },

    async refresh(tokens) {
      return { ...toTokens(await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken })), refreshToken: tokens.refreshToken };
    },

    async publish(account, input) {
      const boardId = (input.options.boardId as string) ?? (account.settings.default_board_id as string);
      if (!boardId) throw new PlatformError("Pick a Pinterest board for this pin", 400, false);
      const m = input.media[0];
      if (!m) throw new PlatformError("Pinterest requires an image or video", 400, false);
      const media_source =
        m.kind === "video"
          ? { source_type: "video_id", media_id: await uploadVideo(account, m.url), cover_image_url: input.options.coverImageUrl }
          : { source_type: "image_url", url: m.url };
      const pin = await requestJson(`${API}/pins`, {
        method: "POST",
        bearer: account.tokens.accessToken,
        json: {
          board_id: boardId,
          title: input.title?.slice(0, 100),
          description: input.text.slice(0, 500),
          link: input.link,
          media_source,
        },
      });
      return { externalId: pin.id, url: `https://www.pinterest.com/pin/${pin.id}/`, status: "published" };
    },

    async fetchPostMetrics(account, ids) {
      const out: Record<string, PostMetrics> = {};
      const end = new Date();
      const start = new Date(end.getTime() - 89 * 864e5); // analytics window is limited to 90 days
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      for (const id of ids) {
        const res = await requestJson(`${API}/pins/${id}/analytics`, {
          bearer: account.tokens.accessToken,
          query: { start_date: iso(start), end_date: iso(end), metric_types: "IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK,VIDEO_MRC_VIEW" },
        });
        const s = res.all?.lifetime_metrics ?? res.all?.summary_metrics ?? {};
        out[id] = {
          impressions: s.IMPRESSION,
          saves: s.SAVE,
          clicks: (s.PIN_CLICK ?? 0) + (s.OUTBOUND_CLICK ?? 0),
          views: s.VIDEO_MRC_VIEW,
          raw: s,
        };
      }
      return out;
    },

    async fetchAccountMetrics(account) {
      const me = await requestJson(`${API}/user_account`, { bearer: account.tokens.accessToken });
      return { followers: me.follower_count, following: me.following_count, postsCount: me.pin_count, raw: me };
    },
  };
}
