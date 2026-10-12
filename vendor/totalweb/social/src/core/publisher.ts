// Publishing + metrics workers. Runtime-agnostic: called from Supabase Edge Functions (Deno)
// and from the Next.js cron fallback route. `db` is a service-role supabase-js client.
import { getAdapter } from "./adapters/index.ts";
import { decryptTokens, encryptTokens } from "./crypto.ts";
import { PlatformError, type AccountContext, type MediaRef, type PlatformKey, type TokenSet } from "./types.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export interface WorkerEnv {
  db: Db;
  env: (name: string) => string | undefined;
  /** base64 32-byte key used to encrypt account tokens */
  encKey: string;
  log?: (msg: string, extra?: unknown) => void;
}

const MAX_ATTEMPTS = 5;
const REFRESH_MARGIN_MS = 5 * 60_000;
const SIGNED_URL_TTL_S = 60 * 60;

export const backoffMs = (attempt: number) => Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempt - 1));

/** Loads an account and returns a context with valid (refreshed if needed) tokens. */
export async function loadAccount(w: WorkerEnv, accountId: string): Promise<{ platform: PlatformKey; ctx: AccountContext; row: any }> {
  const { data: row, error } = await w.db.from("social_accounts").select("*").eq("id", accountId).single();
  if (error) throw new Error(error.message);
  let tokens: TokenSet = await decryptTokens(row.token_ciphertext, w.encKey);
  const adapter = getAdapter(row.platform, w.env);

  if (tokens.expiresAt && tokens.expiresAt - Date.now() < REFRESH_MARGIN_MS && adapter.refresh) {
    tokens = await adapter.refresh(tokens);
    await w.db
      .from("social_accounts")
      .update({
        token_ciphertext: await encryptTokens(tokens, w.encKey),
        token_expires_at: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
        status: "active",
        last_error: null,
      })
      .eq("id", accountId);
  }
  return {
    platform: row.platform,
    row,
    ctx: { externalId: row.external_id, tokens, settings: { ...(row.settings ?? {}), username: row.username } },
  };
}

async function mediaRefs(w: WorkerEnv, ids: string[]): Promise<MediaRef[]> {
  if (!ids?.length) return [];
  const { data: assets = [] } = await w.db.from("social_media_assets").select("*").in("id", ids);
  const byId = new Map(assets.map((a: any) => [a.id, a]));
  const refs: MediaRef[] = [];
  for (const id of ids) {
    const a: any = byId.get(id);
    if (!a) continue;
    const { data, error } = await w.db.storage.from("media").createSignedUrl(a.storage_path, SIGNED_URL_TTL_S);
    if (error) throw new Error(`Signing ${a.storage_path}: ${error.message}`);
    refs.push({ url: data.signedUrl, mime: a.mime, kind: a.kind, sizeBytes: a.size_bytes ?? undefined });
  }
  return refs;
}

async function markAccountError(w: WorkerEnv, accountId: string, err: PlatformError) {
  await w.db
    .from("social_accounts")
    .update({ status: err.authExpired ? "expired" : "error", last_error: err.message })
    .eq("id", accountId);
}

/** Applies a publish failure: retry with backoff when transient, otherwise fail the target. */
async function failTarget(w: WorkerEnv, target: any, err: unknown) {
  const pe = err instanceof PlatformError ? err : null;
  const message = err instanceof Error ? err.message : String(err);
  if (pe?.authExpired) await markAccountError(w, target.account_id, pe);
  const retry = (pe ? pe.retryable : true) && target.attempts < MAX_ATTEMPTS;
  await w.db
    .from("social_post_targets")
    .update(
      retry
        ? { status: "pending", error: message, next_attempt_at: new Date(Date.now() + backoffMs(target.attempts)).toISOString() }
        : { status: "failed", error: message },
    )
    .eq("id", target.id);
  w.log?.(`target ${target.id} ${retry ? "will retry" : "failed"}: ${message}`);
}

/** One publisher tick: finish async uploads, then publish everything that's due. */
export async function runPublishTick(w: WorkerEnv, { batch = 10 } = {}) {
  const summary = { published: 0, processing: 0, failed: 0, retried: 0 };

  // 1) Resolve async publishes (TikTok, IG Reels, Threads video).
  const { data: processing = [] } = await w.db
    .from("social_post_targets")
    .select("*")
    .eq("status", "processing")
    .limit(batch * 2);
  for (const t of processing) {
    try {
      const { platform, ctx } = await loadAccount(w, t.account_id);
      const adapter = getAdapter(platform, w.env);
      const res = await adapter.checkStatus!(ctx, t.external_id);
      if (res.status === "failed") {
        await w.db.from("social_post_targets").update({ status: "failed", error: res.error }).eq("id", t.id);
        summary.failed++;
      } else if (res.status === "published") {
        await w.db
          .from("social_post_targets")
          .update({ status: "published", external_id: res.externalId, external_url: res.url ?? t.external_url, published_at: new Date().toISOString(), error: null })
          .eq("id", t.id);
        summary.published++;
      } else summary.processing++;
    } catch (err) {
      // Status checks are idempotent: leave as processing unless the platform hard-fails.
      if (err instanceof PlatformError && !err.retryable) {
        await w.db.from("social_post_targets").update({ status: "failed", error: err.message }).eq("id", t.id);
        summary.failed++;
      }
    }
  }

  // 2) Claim due targets (FOR UPDATE SKIP LOCKED inside the RPC) and publish.
  const { data: claimed = [], error } = await w.db.rpc("social_claim_due_targets", { batch });
  if (error) throw new Error(error.message);

  for (const t of claimed) {
    try {
      const { data: post, error: postErr } = await w.db.from("social_posts").select("*").eq("id", t.post_id).single();
      if (postErr) throw new Error(postErr.message);
      const { platform, ctx } = await loadAccount(w, t.account_id);
      const adapter = getAdapter(platform, w.env);
      const res = await adapter.publish(ctx, {
        text: t.content_override ?? post.content,
        title: post.title ?? undefined,
        link: post.link ?? undefined,
        tags: post.tags,
        media: await mediaRefs(w, post.media_ids),
        options: t.options ?? {},
      });
      await w.db
        .from("social_post_targets")
        .update({
          status: res.status,
          external_id: res.externalId,
          external_url: res.url ?? null,
          published_at: res.status === "published" ? new Date().toISOString() : null,
          error: null,
        })
        .eq("id", t.id);
      res.status === "published" ? summary.published++ : summary.processing++;
    } catch (err) {
      await failTarget(w, t, err);
      const willRetry = (!(err instanceof PlatformError) || err.retryable) && t.attempts < MAX_ATTEMPTS;
      willRetry ? summary.retried++ : summary.failed++;
    }
  }
  return summary;
}

/** Snapshots metrics for posts published in the last `days`, plus account-level metrics. */
export async function runMetricsSync(w: WorkerEnv, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data: accounts = [] } = await w.db.from("social_accounts").select("id, workspace_id, platform").eq("status", "active");
  const summary = { accounts: 0, posts: 0, errors: 0 };

  for (const acc of accounts) {
    try {
      const { platform, ctx } = await loadAccount(w, acc.id);
      const adapter = getAdapter(platform, w.env);
      const { data: targets = [] } = await w.db
        .from("social_post_targets")
        .select("id, external_id")
        .eq("account_id", acc.id)
        .eq("status", "published")
        .gte("published_at", since);

      const byExternal = new Map<string, string>(targets.filter((t: any) => t.external_id).map((t: any) => [t.external_id, t.id]));
      if (byExternal.size) {
        const metrics = await adapter.fetchPostMetrics(ctx, [...byExternal.keys()]);
        const rows = Object.entries(metrics)
          .filter(([ext]) => byExternal.has(ext))
          .map(([ext, m]) => ({
            workspace_id: acc.workspace_id,
            target_id: byExternal.get(ext),
            impressions: m.impressions,
            reach: m.reach,
            views: m.views,
            likes: m.likes,
            comments: m.comments,
            shares: m.shares,
            saves: m.saves,
            clicks: m.clicks,
            watch_time_s: m.watchTimeS,
            raw: m.raw ?? {},
          }));
        if (rows.length) await w.db.from("social_post_metrics").insert(rows);
        summary.posts += rows.length;
      }

      const am = await adapter.fetchAccountMetrics(ctx);
      if (am.followers != null || am.postsCount != null) {
        await w.db.from("social_account_metrics").insert({
          workspace_id: acc.workspace_id,
          account_id: acc.id,
          followers: am.followers,
          following: am.following,
          posts_count: am.postsCount,
          raw: am.raw ?? {},
        });
      }
      summary.accounts++;
    } catch (err) {
      summary.errors++;
      if (err instanceof PlatformError && err.authExpired) await markAccountError(w, acc.id, err);
      w.log?.(`metrics ${acc.id}: ${(err as Error).message}`);
    }
  }
  return summary;
}
