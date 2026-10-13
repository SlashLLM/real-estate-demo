"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@totalweb/supabase/admin";
import { createClient } from "@totalweb/supabase/server";
import { requireWorkspace } from "@totalweb/supabase/workspace";
import { revalidatePublished } from "./handlers";
import { scheduleSchema, type AutopilotKind, type ScheduleInput } from "./plan";
import { runAutopilotTick } from "./tick";
import { AUTOPILOT_BASE } from "./env";

async function ctx() {
  const [supabase, workspace] = await Promise.all([createClient(), requireWorkspace()]);
  return { supabase, ws: workspace.id };
}

function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

/** Creates or updates the workspace's schedule of this kind (RLS: owners/admins). */
export async function saveSchedule(input: ScheduleInput) {
  const { supabase, ws } = await ctx();
  const s = scheduleSchema.parse(input);
  const current = check(
    await supabase.from("autopilot_schedules").select("enabled, interval_hours, next_run_at").eq("workspace_id", ws).eq("kind", s.kind).maybeSingle(),
  ) as { enabled: boolean; interval_hours: number; next_run_at: string | null } | null;
  // (Re)arm the clock when the schedule is switched on or its interval changes; otherwise keep the next run where it is.
  const rearm = s.enabled && (!current?.enabled || current.interval_hours !== s.intervalHours || !current.next_run_at);
  const next_run_at = !s.enabled ? null : rearm ? new Date(Date.now() + s.intervalHours * 3600e3).toISOString() : current!.next_run_at;
  check(
    await supabase.from("autopilot_schedules").upsert(
      {
        workspace_id: ws,
        kind: s.kind,
        enabled: s.enabled,
        interval_hours: s.intervalHours,
        voice_profile_id: s.voiceProfileId ?? null,
        config: s.config,
        next_run_at,
        ...(s.enabled && !current?.enabled ? { consecutive_failures: 0, last_error: null } : {}),
      },
      { onConflict: "workspace_id,kind" },
    ),
  );
  revalidatePath(AUTOPILOT_BASE, "layout");
}

/** Starts a run of this schedule now (it must be switched on), then runs the tick so it begins immediately. */
export async function runNow(kind: AutopilotKind) {
  const { supabase, ws } = await ctx();
  const s = check(await supabase.from("autopilot_schedules").select("id, enabled").eq("workspace_id", ws).eq("kind", kind).maybeSingle()) as {
    id: string;
    enabled: boolean;
  } | null;
  if (!s?.enabled) throw new Error("Switch the schedule on (and save it) first");
  const { count } = await supabase.from("autopilot_runs").select("id", { count: "exact", head: true }).eq("schedule_id", s.id).eq("status", "running");
  if (count) throw new Error("A run is already in progress");
  check(await supabase.from("autopilot_schedules").update({ next_run_at: new Date().toISOString() }).eq("id", s.id));
  const summary = await runAutopilotTick();
  revalidatePublished(summary);
  revalidatePath(AUTOPILOT_BASE, "layout");
  const mine = summary.errors.find((e) => e.includes(s.id));
  if (mine) throw new Error(mine.replace(/^\w+ schedule [\w-]+: /, ""));
}

/** Refreshes open runs (syncs engine jobs, publishes what's ready) without waiting for the next cron tick. */
export async function refreshRuns() {
  await ctx();
  const summary = await runAutopilotTick();
  revalidatePublished(summary);
  revalidatePath(AUTOPILOT_BASE, "layout");
}

/** Removes a failed run from the history (owners/admins). Runs in progress, or that published anything, stay. */
export async function removeFailedRun(runId: string) {
  const workspace = await requireWorkspace();
  if (workspace.role !== "owner" && workspace.role !== "admin") throw new Error("Only owners and admins can remove runs");
  // Runs are written only by the tick (service role); members can read them, so the delete goes through it too.
  const { data, error } = await createAdminClient()
    .from("autopilot_runs")
    .delete()
    .eq("id", runId)
    .eq("workspace_id", workspace.id)
    .eq("status", "failed")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only failed runs can be removed");
  revalidatePath(AUTOPILOT_BASE, "layout");
}
