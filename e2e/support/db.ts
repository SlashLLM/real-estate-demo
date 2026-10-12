// Service-role access for seeding and cleanup. Everything the suite writes lives in one throwaway user's workspace;
// cleanup removes that workspace (and its storage objects) and the user.
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SEED_FILE, TEST_EMAIL_DOMAIN, TEST_EMAIL_PREFIX } from "./constants";

export interface Seed {
  email: string;
  password: string;
  userId: string;
  workspaceId: string;
  workspaceName: string;
  formId: string;
  accounts: { linkedin: string; x: string; facebook: string };
  posts: { published: string; failed: string };
}

export const readSeed = (): Seed => JSON.parse(readFileSync(SEED_FILE, "utf8"));

let client: SupabaseClient | null = null;

export function admin() {
  if (client) return client;
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // CI can supply the variables directly.
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the e2e suite");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** The data of a Supabase response (its success branch), or a labelled error. */
function must<R extends { data: unknown; error: { message: string } | null }>(res: R, what: string) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as NonNullable<Extract<R, { error: null }>["data"]>;
}

/** Removes a test user's workspace (all CRM + social rows cascade), its media objects, and the user. */
export async function deleteTestUser(userId: string) {
  const db = admin();
  const { data: memberships } = await db.from("workspace_members").select("workspace_id").eq("user_id", userId);
  for (const { workspace_id: ws } of memberships ?? []) {
    const { data: objects } = await db.storage.from("media").list(ws, { limit: 1000 });
    if (objects?.length) await db.storage.from("media").remove(objects.map((o) => `${ws}/${o.name}`));
    // Deals reference stages with ON DELETE RESTRICT, so clear them before the workspace cascade reaches the stages.
    await db.from("crm_deals").delete().eq("workspace_id", ws);
    must(await db.from("workspaces").delete().eq("id", ws), "delete workspace");
  }
  must(await db.auth.admin.deleteUser(userId), "delete user");
}

/** Leftovers from runs that were killed before teardown. Only matches the suite's own throwaway emails. */
export async function deleteStaleTestUsers() {
  const db = admin();
  for (let page = 1; page < 50; page++) {
    const { users } = must(await db.auth.admin.listUsers({ page, perPage: 200 }), "list users");
    const stale = users.filter((u) => u.email?.startsWith(TEST_EMAIL_PREFIX) && u.email.endsWith(`@${TEST_EMAIL_DOMAIN}`));
    for (const u of stale) await deleteTestUser(u.id);
    if (users.length < 200) break;
  }
}

const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

/** Creates the admin user (its workspace, pipeline and lead form come from DB triggers) and the social fixtures. */
export async function createSeed(email: string, password: string): Promise<Seed> {
  const db = admin();
  const user = must(
    await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "E2E Admin" } }),
    "create user",
  ).user;

  const member = must(
    await db.from("workspace_members").select("workspace_id, workspaces(name)").eq("user_id", user.id).single(),
    "find workspace",
  ) as unknown as { workspace_id: string; workspaces: { name: string } };
  const ws = member.workspace_id;
  const form = must(await db.from("crm_lead_forms").select("id").eq("workspace_id", ws).single(), "find lead form");

  // Fake connections: the token is never decryptable, so nothing can ever be sent to a real platform.
  const account = (platform: string, name: string, extra: Record<string, unknown> = {}) => ({
    workspace_id: ws,
    platform,
    external_id: `e2e-${platform}`,
    name,
    token_ciphertext: "v1:e2e-not-a-real-token",
    status: "active",
    connected_by: user.id,
    ...extra,
  });
  const accounts = must(
    await db
      .from("social_accounts")
      .insert([
        account("linkedin", "PropertyPro LinkedIn", { username: "propertypro" }),
        account("x", "PropertyPro on X", { username: "propertypro_sg" }),
        account("facebook", "PropertyPro Facebook Page", { status: "expired", last_error: "Token expired: reconnect the page" }),
      ])
      .select("id, platform"),
    "seed accounts",
  );
  const accountId = (p: string) => accounts.find((a) => a.platform === p)!.id as string;

  // One published post with metrics (analytics, history) and one failed post (history retry).
  const published = must(
    await db
      .from("social_posts")
      .insert({
        workspace_id: ws,
        content: "Seeded: Tampines HDB resale prices rose 3% this quarter",
        status: "published",
        scheduled_at: daysAgo(3),
        published_at: daysAgo(3),
        topic: "market update",
        format: "text",
        created_by: user.id,
      })
      .select("id")
      .single(),
    "seed published post",
  );
  const publishedTarget = must(
    await db
      .from("social_post_targets")
      .insert({
        workspace_id: ws,
        post_id: published.id,
        account_id: accountId("linkedin"),
        platform: "linkedin",
        status: "published",
        scheduled_at: daysAgo(3),
        published_at: daysAgo(3),
        external_id: "e2e-published",
        external_url: "https://www.linkedin.com/feed/update/e2e-seeded",
      })
      .select("id")
      .single(),
    "seed published target",
  );
  must(
    await db.from("social_post_metrics").insert({
      workspace_id: ws,
      target_id: publishedTarget.id,
      impressions: 1500,
      reach: 1200,
      likes: 40,
      comments: 5,
      shares: 3,
      saves: 2,
    }),
    "seed metrics",
  );
  must(
    await db.from("social_account_metrics").insert([
      { workspace_id: ws, account_id: accountId("linkedin"), captured_at: daysAgo(10), followers: 100 },
      { workspace_id: ws, account_id: accountId("linkedin"), captured_at: daysAgo(1), followers: 130 },
    ]),
    "seed follower metrics",
  );

  const failed = must(
    await db
      .from("social_posts")
      .insert({
        workspace_id: ws,
        content: "Seeded: lease decay explained for 60-year-old flats",
        status: "failed",
        scheduled_at: daysAgo(1),
        format: "text",
        created_by: user.id,
      })
      .select("id")
      .single(),
    "seed failed post",
  );
  must(
    await db.from("social_post_targets").insert({
      workspace_id: ws,
      post_id: failed.id,
      account_id: accountId("x"),
      platform: "x",
      status: "failed",
      scheduled_at: daysAgo(1),
      attempts: 5,
      error: "Seeded failure: token rejected by X",
    }),
    "seed failed target",
  );

  return {
    email,
    password,
    userId: user.id,
    workspaceId: ws,
    workspaceName: member.workspaces.name,
    formId: form.id,
    accounts: { linkedin: accountId("linkedin"), x: accountId("x"), facebook: accountId("facebook") },
    posts: { published: published.id, failed: failed.id },
  };
}
