// Video director: films made from the product's real screens, in two steps (ConGenEng /v1/video/proposal → /build).
// Step 1 researches the product and proposes three concepts with scripts, beat sheets and voice samples; the client picks,
// edits and approves in the Videos tab; step 2 builds the film. Demo logins (optional) let the engine capture the
// logged-in app read-only; their passwords are AES-GCM encrypted in workspace settings and only decrypted here.
import { createAdminClient } from "@totalweb/supabase/admin";
import { decryptTokens, encryptTokens, formatForSpec, VIDEO_FORMATS, type VoiceMode, type PlatformKey, type VideoFormat } from "../core/index.ts";
export { VIDEO_FORMATS, type VideoFormat };
import { API_BASE, encKey, siteUrl } from "./env";
import { resolveBrand } from "./brand";
import { engineConfig, signedHeaders, storeEngineMedia } from "./engine-client";

export interface DemoAccountInput {
  id?: string;
  role: string;
  login_url: string;
  email: string;
  password?: string; // empty → keep the saved one
  notes?: string;
}
export interface DemoAccountPublic {
  id: string;
  role: string;
  login_url: string;
  email: string;
  notes?: string;
  has_password: boolean;
}
interface DemoAccountStored extends Omit<DemoAccountPublic, "has_password"> {
  password_ct: string;
}

export interface VideoRequestInput {
  title?: string;
  format: VideoFormat;
  aspect?: string;
  length_s: number;
  goal?: string;
  focus?: string[];
  platforms?: PlatformKey[];
  useLogins?: boolean;
  voiceMode?: VoiceMode;
  draftId?: string | null;
}

/** Which format a batch video draft for a platform gets. */
// ---------------------------------------------------------------------------------------------- demo logins

async function workspaceSettings(workspaceId: string) {
  const { data } = await createAdminClient().from("workspaces").select("name, settings").eq("id", workspaceId).single();
  return { name: data?.name as string | undefined, settings: (data?.settings ?? {}) as Record<string, any> };
}

export async function listDemoAccounts(workspaceId: string): Promise<DemoAccountPublic[]> {
  const { settings } = await workspaceSettings(workspaceId);
  return ((settings.demo_accounts ?? []) as DemoAccountStored[]).map(({ password_ct, ...a }) => ({ ...a, has_password: !!password_ct }));
}

export async function saveDemoAccounts(workspaceId: string, input: DemoAccountInput[]) {
  const { settings } = await workspaceSettings(workspaceId);
  const prev = new Map(((settings.demo_accounts ?? []) as DemoAccountStored[]).map((a) => [a.id, a]));
  const next: DemoAccountStored[] = [];
  for (const a of input) {
    if (!a.role.trim() || !a.email.trim()) continue;
    const id = a.id ?? crypto.randomUUID();
    const password_ct = a.password ? await encryptTokens({ accessToken: a.password }, encKey()) : prev.get(id)?.password_ct;
    if (!password_ct) throw new Error(`Enter a password for the ${a.role} login`);
    next.push({ id, role: a.role.trim(), login_url: a.login_url.trim() || "/login", email: a.email.trim(), notes: a.notes?.trim() || undefined, password_ct });
  }
  await createAdminClient().from("workspaces").update({ settings: { ...settings, demo_accounts: next } }).eq("id", workspaceId);
}

async function demoAccountsForEngine(workspaceId: string) {
  const { settings } = await workspaceSettings(workspaceId);
  const out = [];
  for (const a of (settings.demo_accounts ?? []) as DemoAccountStored[]) {
    const { accessToken } = await decryptTokens(a.password_ct, encKey());
    out.push({ role: a.role, login_url: a.login_url, email: a.email, password: accessToken, notes: a.notes ?? null });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- engine calls

async function post(path: string, payload: unknown) {
  const { url, secret } = engineConfig();
  const body = JSON.stringify(payload);
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await signedHeaders(secret, body)) },
    body,
  });
  if (!res.ok) throw new Error(`Engine rejected the request (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as { job_id: string };
}

async function brandFor(workspaceId: string) {
  const { name, settings } = await workspaceSettings(workspaceId);
  const brand = resolveBrand(name, settings.brand);
  // No website in the profile: the film is about the site this module runs on.
  if (!brand.website) brand.website = siteUrl();
  return brand;
}

/** Step 1: create a project and ask the engine for a proposal. Returns the project id. */
export async function startVideoProject(workspaceId: string, userId: string | null, input: VideoRequestInput) {
  const db = createAdminClient();
  const fmt = VIDEO_FORMATS[input.format];
  const request = {
    format: input.format,
    aspect: input.aspect ?? fmt.aspect,
    length_s: input.length_s,
    goal: input.goal ?? null,
    focus: input.focus ?? [],
    platforms: input.platforms ?? [],
    use_logins: input.useLogins ?? true,
    voice_mode: input.voiceMode ?? "voiceover",
  };
  const { data: project, error } = await db
    .from("social_video_projects")
    .insert({ workspace_id: workspaceId, draft_id: input.draftId ?? null, title: input.title ?? null, request, created_by: userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await sendProposal(workspaceId, project.id, request);
  return project.id as string;
}

async function sendProposal(workspaceId: string, projectId: string, request: Record<string, any>) {
  const db = createAdminClient();
  try {
    const { job_id } = await post("/v1/video/proposal", {
      workspace_id: workspaceId,
      job_ref: projectId,
      brand: await brandFor(workspaceId),
      format: request.format,
      aspect: request.aspect,
      length_s: request.length_s,
      goal: request.goal,
      focus: request.focus,
      platforms: request.platforms,
      voice_mode: request.voice_mode ?? "voiceover",
      demo_accounts: request.use_logins ? await demoAccountsForEngine(workspaceId) : [],
      callback_url: `${siteUrl()}${API_BASE}/engine/callback`,
    });
    await db.from("social_video_projects").update({ status: "proposing", proposal_job_id: job_id, error: null }).eq("id", projectId);
  } catch (e) {
    await db.from("social_video_projects").update({ status: "failed", error: (e as Error).message }).eq("id", projectId);
    throw e;
  }
}

/** Step 2: the client's choice → build. */
export async function approveVideoProject(
  workspaceId: string,
  projectId: string,
  approval: { concept: string; script: string[]; voice: string; captions: boolean },
) {
  const db = createAdminClient();
  const { data: p } = await db.from("social_video_projects").select("*").eq("id", projectId).eq("workspace_id", workspaceId).single();
  if (!p) throw new Error("Unknown video");
  if (!p.proposal_job_id || !p.proposal) throw new Error("This video has no proposal yet");
  const script = approval.script.map((l) => l.trim()).filter(Boolean);
  if (!script.length) throw new Error("The script is empty");
  await db.from("social_video_projects").update({ approval: { ...approval, script }, status: "building", error: null, result: null }).eq("id", projectId);
  try {
    const { job_id } = await post("/v1/video/build", {
      workspace_id: workspaceId,
      job_ref: projectId,
      proposal_id: p.proposal_job_id,
      concept: approval.concept,
      script,
      voice: approval.voice,
      captions: approval.captions,
      brand: await brandFor(workspaceId),
      demo_accounts: p.request?.use_logins ? await demoAccountsForEngine(workspaceId) : [],
      callback_url: `${siteUrl()}${API_BASE}/engine/callback`,
    });
    await db.from("social_video_projects").update({ build_job_id: job_id }).eq("id", projectId);
  } catch (e) {
    await db.from("social_video_projects").update({ status: "failed", error: (e as Error).message }).eq("id", projectId);
    throw e;
  }
}

/** Retry whichever step failed. */
export async function retryVideoProject(workspaceId: string, projectId: string) {
  const db = createAdminClient();
  const { data: p } = await db.from("social_video_projects").select("*").eq("id", projectId).eq("workspace_id", workspaceId).single();
  if (!p) throw new Error("Unknown video");
  if (p.approval && p.proposal) return approveVideoProject(workspaceId, projectId, p.approval);
  await db.from("social_video_projects").update({ status: "proposing", error: null }).eq("id", projectId);
  return sendProposal(workspaceId, projectId, p.request ?? {});
}

/** Batch video drafts: one project per draft, proposal requested straight away. */
export async function startProjectsForDrafts(
  workspaceId: string,
  drafts: { id: string; platform: PlatformKey; idea: Record<string, any> }[],
  spec?: { aspect?: string; durationS?: number } | null,
) {
  const length_s = Math.min(150, Math.max(10, Math.round(spec?.durationS ?? 30)));
  for (const d of drafts) {
    const { format, aspect } = formatForSpec(spec, d.platform);
    const brief = d.idea?.video_brief ?? {};
    const goal = [d.idea?.title, brief.hook && `Hook: ${brief.hook}`, brief.key_points?.length && `Points: ${brief.key_points.join("; ")}`, brief.call_to_action && `CTA: ${brief.call_to_action}`]
      .filter(Boolean)
      .join(". ");
    try {
      await startVideoProject(workspaceId, null, { title: d.idea?.title, format, aspect, length_s, goal, platforms: [d.platform], useLogins: true, draftId: d.id });
    } catch (e) {
      console.warn("video proposal for draft", d.id, "failed:", (e as Error).message);
    }
  }
}

// ---------------------------------------------------------------------------------------------- results

/** Applies a director result (kind video_proposal / video_build) to its project. Idempotent. */
export async function applyVideoResult(result: any): Promise<{ status: number; error: string } | { duplicate?: boolean; ok?: boolean }> {
  const db = createAdminClient();
  const { data: p } = await db.from("social_video_projects").select("*").eq("id", result.job_ref).single();
  if (!p) return { status: 404, error: "Unknown video project" };
  const isBuild = result.kind === "video_build";
  const jobId = isBuild ? p.build_job_id : p.proposal_job_id;
  if (jobId && result.job_id && jobId !== result.job_id) return { duplicate: true }; // a stale run
  const want = isBuild ? "building" : "proposing";
  if (p.status !== want) return { duplicate: true };
  const stepUsd = result.insights?.cost?.total_usd ?? null;
  const cost = { ...(p.cost ?? {}), [isBuild ? "build_usd" : "proposal_usd"]: stepUsd, [isBuild ? "build" : "proposal"]: result.insights?.cost ?? null };
  cost.total_usd = Number(cost.proposal_usd ?? 0) + Number(cost.build_usd ?? 0);

  if (result.status !== "succeeded") {
    await db.from("social_video_projects").update({ status: "failed", error: result.error ?? "The engine failed", cost }).eq("id", p.id).eq("status", want);
    return { ok: true };
  }
  if (!isBuild) {
    const proposal = result.video_proposal;
    const title = p.title ?? proposal?.treatment?.concepts?.find((c: any) => c.key === proposal?.treatment?.recommended)?.title ?? null;
    await db.from("social_video_projects").update({ status: "proposed", proposal, title, cost }).eq("id", p.id).eq("status", want);
    return { ok: true };
  }
  // claim the build so a callback and a status sync can't both import the film
  const { data: claimed } = await db.from("social_video_projects").update({ status: "done" }).eq("id", p.id).eq("status", "building").select("id");
  if (!claimed?.length) return { duplicate: true };
  try {
    const mediaId = await storeEngineMedia(p.workspace_id, { url: result.video.url, mime: "video/mp4", kind: "video" });
    const { url, media_id, ...rest } = result.video;
    await db.from("social_video_projects").update({ media_id: mediaId, result: rest, cost, error: null }).eq("id", p.id);
    if (p.draft_id) await db.from("social_generated_drafts").update({ media_ids: [mediaId] }).eq("id", p.draft_id);
  } catch (e) {
    await db.from("social_video_projects").update({ status: "building" }).eq("id", p.id);
    return { status: 502, error: `Could not import the film: ${(e as Error).message}` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------- list (with live progress)

/** Projects, newest first, with live stage/progress/cost from the engine for the ones in flight (and missed callbacks
 * applied, as for generation jobs). */
export async function listVideoProjects(workspaceId: string) {
  const { fetchEngineJob } = await import("./engine-client");
  const db = createAdminClient();
  const { data } = await db.from("social_video_projects").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50);
  const projects = (data ?? []) as any[];
  const mediaIds = projects.map((p) => p.media_id).filter(Boolean);
  const urls = new Map<string, string>();
  if (mediaIds.length) {
    const { data: assets } = await db.from("social_media_assets").select("id, storage_path").in("id", mediaIds);
    const { data: signed } = await db.storage.from("media").createSignedUrls((assets ?? []).map((a: any) => a.storage_path), 3600);
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const a of assets ?? []) urls.set(a.id, byPath.get(a.storage_path) ?? "");
  }
  return Promise.all(
    projects.map(async (p) => {
      const out = { ...p, video_url: p.media_id ? urls.get(p.media_id) ?? null : null, live: null as null | { stage: string | null; progress: number | null; cost_usd: number | null } };
      const jobId = p.status === "proposing" ? p.proposal_job_id : p.status === "building" ? p.build_job_id : null;
      if (!jobId) return out;
      try {
        const live = await fetchEngineJob(jobId);
        if ((live.status === "succeeded" || live.status === "failed") && live.result) {
          await applyVideoResult(live.result);
          const { data: fresh } = await db.from("social_video_projects").select("*").eq("id", p.id).single();
          return { ...out, ...(fresh ?? {}), live: null };
        }
        out.live = { stage: live.stage, progress: live.progress, cost_usd: live.cost_usd ?? null };
      } catch {
        out.live = { stage: "Waiting for the engine…", progress: null, cost_usd: null };
      }
      return out;
    }),
  );
}
