import { createClient } from "@totalweb/supabase/server";
import { requireWorkspace } from "@totalweb/supabase/workspace";
import { listVoiceProfiles } from "@totalweb/social/server";
import type { Account, VoiceProfile } from "@totalweb/social";
import type { AutopilotKind, AutopilotRun, AutopilotSchedule } from "./plan";

export interface AutopilotState {
  schedules: Partial<Record<AutopilotKind, AutopilotSchedule>>;
  runs: Partial<Record<AutopilotKind, AutopilotRun[]>>;
  voices: VoiceProfile[];
  accounts: Account[];
}

/** Everything the Autopilot page shows: both schedules, their recent runs, the voices and the social accounts. */
export async function getAutopilotState(): Promise<AutopilotState> {
  const [supabase, workspace] = await Promise.all([createClient(), requireWorkspace()]);
  const ws = workspace.id;
  const [{ data: schedules }, { data: runs }, voices, { data: accounts }] = await Promise.all([
    supabase.from("autopilot_schedules").select("*").eq("workspace_id", ws),
    supabase.from("autopilot_runs").select("*").eq("workspace_id", ws).order("started_at", { ascending: false }).limit(40),
    listVoiceProfiles(ws),
    supabase.from("social_accounts_public").select("*").eq("workspace_id", ws).order("platform"),
  ]);
  const state: AutopilotState = { schedules: {}, runs: { blog: [], social: [] }, voices, accounts: (accounts ?? []) as Account[] };
  for (const s of (schedules ?? []) as AutopilotSchedule[]) state.schedules[s.kind] = s;
  for (const r of (runs ?? []) as AutopilotRun[]) {
    const list = state.runs[r.kind]!;
    if (list.length < 10) list.push(r);
  }
  return state;
}

export async function getVoices(): Promise<VoiceProfile[]> {
  const workspace = await requireWorkspace();
  return listVoiceProfiles(workspace.id);
}
