import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@totalweb/supabase/admin";
import { getUser } from "@totalweb/supabase/server";
import { requireWorkspace } from "@totalweb/supabase/workspace";
import {
  encryptTokens,
  getAdapter,
  PLATFORM_KEYS,
  pkceChallenge,
  randomToken,
  runMetricsSync,
  runPublishTick,
  safeEqual,
  type PlatformKey,
} from "../core/index.ts";
import { env, encKey, redirectUri, UI_BASE } from "./env";
import { handleEngineCallback } from "./engine-client";
import { storeMedia } from "./media";

const OAUTH_COOKIE = "tw_social_oauth";
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/**
 * Route handlers for the social module. Mount in the host app at
 * `app/api/social/[...path]/route.ts`:
 *
 *   export const { GET, POST } = createSocialHandlers();
 *   export const maxDuration = 300;
 *
 * Routes:
 *   GET  connect/:platform     start OAuth (redirects to the platform)
 *   GET  callback/:platform    OAuth callback; stores encrypted tokens
 *   POST media                 multipart upload → storage + social_media_assets row
 *   POST cron/publish          publisher tick   (x-cron-secret) — fallback when not using Edge Functions
 *   POST cron/metrics          metrics sync     (x-cron-secret)
 *   POST engine/callback       ConGenEng results (HMAC-signed)
 */
export function createSocialHandlers() {
  const segments = (req: NextRequest) => req.nextUrl.pathname.replace(/^.*?\/api\/social\/?/, "").split("/").filter(Boolean);
  const isPlatform = (p?: string): p is PlatformKey => !!p && (PLATFORM_KEYS as string[]).includes(p);

  async function GET(req: NextRequest) {
    const [action, platform] = segments(req);
    if (action === "connect" && isPlatform(platform)) return connect(platform);
    if (action === "callback" && isPlatform(platform)) return callback(req, platform);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  async function POST(req: NextRequest) {
    const [a, b] = segments(req);
    if (a === "media") return upload(req);
    if (a === "cron" && (b === "publish" || b === "metrics")) return cron(req, b);
    if (a === "engine" && b === "callback") return handleEngineCallback(req);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return { GET, POST };
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------
async function connect(platform: PlatformKey) {
  const ws = await requireWorkspace();
  const adapter = getAdapter(platform, env);
  const state = randomToken(24);
  const verifier = adapter.usesPkce ? randomToken(48) : undefined;
  (await cookies()).set(OAUTH_COOKIE, JSON.stringify({ state, verifier, platform, ws: ws.id }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  const url = adapter.authorizeUrl({
    state,
    redirectUri: redirectUri(platform),
    codeChallenge: verifier ? await pkceChallenge(verifier) : undefined,
  });
  return NextResponse.redirect(url);
}

async function callback(req: NextRequest, platform: PlatformKey) {
  const back = (params: Record<string, string>) =>
    NextResponse.redirect(new URL(`${UI_BASE}/accounts?${new URLSearchParams(params)}`, req.url));

  const jar = await cookies();
  const raw = jar.get(OAUTH_COOKIE)?.value;
  jar.delete(OAUTH_COOKIE);
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return back({ error: q.get("error_description") ?? q.get("error")! });
  if (!raw) return back({ error: "OAuth session expired, try again" });

  const saved = JSON.parse(raw) as { state: string; verifier?: string; platform: string; ws: string };
  const state = q.get("state") ?? "";
  if (saved.platform !== platform || !safeEqual(saved.state, state)) return back({ error: "Invalid OAuth state" });

  // Re-check membership: the cookie only proves which workspace started the flow.
  const ws = await requireWorkspace();
  if (ws.id !== saved.ws) return back({ error: "Workspace changed during connection" });

  try {
    const accounts = await getAdapter(platform, env).exchangeCode({
      code: q.get("code") ?? "",
      redirectUri: redirectUri(platform),
      codeVerifier: saved.verifier,
    });
    if (!accounts.length) return back({ error: `No ${platform} accounts found for this login` });

    const db = createAdminClient();
    const user = await getUser();
    for (const a of accounts) {
      const { error } = await db.from("social_accounts").upsert(
        {
          workspace_id: ws.id,
          platform,
          external_id: a.externalId,
          name: a.name,
          username: a.username ?? null,
          avatar_url: a.avatarUrl ?? null,
          token_ciphertext: await encryptTokens(a.tokens, encKey()),
          token_expires_at: a.tokens.expiresAt ? new Date(a.tokens.expiresAt).toISOString() : null,
          settings: a.settings ?? {},
          status: "active",
          last_error: null,
          connected_by: user?.id ?? null,
        },
        { onConflict: "workspace_id,platform,external_id" },
      );
      if (error) throw new Error(error.message);
    }
    return back({ connected: platform, count: String(accounts.length) });
  } catch (err) {
    return back({ error: (err as Error).message.slice(0, 300) });
  }
}

// ---------------------------------------------------------------------------
// Media upload
// ---------------------------------------------------------------------------
async function upload(req: NextRequest) {
  const ws = await requireWorkspace();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
  if (!kind) return NextResponse.json({ error: "Only images and videos are supported" }, { status: 415 });

  const asset = await storeMedia(ws.id, file, kind, "upload", {
    width: Number(form.get("width")) || null,
    height: Number(form.get("height")) || null,
    duration_s: Number(form.get("duration")) || null,
  });
  return NextResponse.json(asset);
}

// ---------------------------------------------------------------------------
// Cron fallback (when not using Supabase Edge Functions + pg_cron)
// ---------------------------------------------------------------------------
async function cron(req: NextRequest, job: "publish" | "metrics") {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !safeEqual(secret, given)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const w = { db: createAdminClient(), env, encKey: encKey(), log: console.log };
  const result = job === "publish" ? await runPublishTick(w) : await runMetricsSync(w);
  return NextResponse.json(result);
}
