import type { BrandProfile } from "./engine-client";
import { voiceText, type VoiceProfile } from "./voices";

/**
 * Brand profile defaults supplied by the host site (TOTALWEB_BRAND = JSON, written by the site scaffold
 * from the client brief). The workspace's saved profile always wins; this only pre-fills an empty one,
 * so a freshly deployed client site can generate content without anyone filling the form first.
 */
export function siteBrandDefaults(): Partial<BrandProfile> {
  const raw = process.env.TOTALWEB_BRAND;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    console.warn("TOTALWEB_BRAND is not valid JSON; ignoring");
    return {};
  }
}

/** A voice profile (the chosen one, or the workspace default) replaces the profile's free-text voice. */
export function resolveBrand(
  workspaceName: string | undefined,
  saved: Partial<BrandProfile> | null | undefined,
  voice?: Pick<VoiceProfile, "description" | "examples"> | null,
): BrandProfile {
  const brand = { name: workspaceName ?? "", niche: "", ...siteBrandDefaults(), ...(saved ?? {}) } as BrandProfile;
  const text = voice ? voiceText(voice) : "";
  return text ? { ...brand, voice: text } : brand;
}
