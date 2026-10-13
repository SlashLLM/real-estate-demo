// Voice profiles: the brand's writing voice (sent to the engine as brand.voice) and its narrator voice for videos.
// The workspace's default profile applies to every generation unless a specific one is chosen.
import { createAdminClient } from "@totalweb/supabase/admin";
import type { VoiceProfile } from "../types";

export type { VoiceProfile };

/** The requested profile, else the workspace default, else null (callers fall back to the brand's free-text voice). */
export async function voiceFor(workspaceId: string, profileId?: string | null): Promise<VoiceProfile | null> {
  const db = createAdminClient();
  if (profileId) {
    const { data } = await db.from("voice_profiles").select("*").eq("workspace_id", workspaceId).eq("id", profileId).maybeSingle();
    if (data) return data as VoiceProfile;
  }
  const { data } = await db.from("voice_profiles").select("*").eq("workspace_id", workspaceId).eq("is_default", true).maybeSingle();
  return (data as VoiceProfile) ?? null;
}

/** How a profile reads to the engine: the description, then the example lines to imitate. */
export function voiceText(p: Pick<VoiceProfile, "description" | "examples">): string {
  const examples = p.examples.map((e) => e.trim()).filter(Boolean);
  return [p.description.trim(), examples.length ? `Write like these examples:\n${examples.map((e) => `- ${e}`).join("\n")}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

/** Profiles, default first. A workspace without any gets one seeded from the brand profile's voice text. */
export async function listVoiceProfiles(workspaceId: string): Promise<VoiceProfile[]> {
  const db = createAdminClient();
  const { data } = await db.from("voice_profiles").select("*").eq("workspace_id", workspaceId).order("is_default", { ascending: false }).order("name");
  if (data?.length) return data as VoiceProfile[];
  const { data: ws } = await db.from("workspaces").select("settings").eq("id", workspaceId).single();
  const voice = (ws?.settings?.brand?.voice as string | undefined)?.trim();
  if (!voice) return [];
  const { data: seeded } = await db
    .from("voice_profiles")
    .insert({ workspace_id: workspaceId, name: "Brand voice", description: voice, is_default: true })
    .select("*");
  return (seeded ?? []) as VoiceProfile[];
}
