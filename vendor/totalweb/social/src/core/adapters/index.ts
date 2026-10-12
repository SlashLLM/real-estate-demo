import type { AppCredentials, PlatformAdapter, PlatformKey } from "../types.ts";
import { facebook, instagram } from "./meta.ts";
import { linkedin } from "./linkedin.ts";
import { pinterest } from "./pinterest.ts";
import { threads } from "./threads.ts";
import { tiktok } from "./tiktok.ts";
import { x } from "./x.ts";
import { youtube } from "./youtube.ts";

/** Env var names holding each platform's developer-app credentials. */
export const CREDENTIAL_ENV: Record<PlatformKey, [string, string]> = {
  youtube: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],
  facebook: ["META_APP_ID", "META_APP_SECRET"],
  instagram: ["META_APP_ID", "META_APP_SECRET"],
  threads: ["THREADS_APP_ID", "THREADS_APP_SECRET"],
  x: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
  linkedin: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  pinterest: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
};

const FACTORIES: Record<PlatformKey, (c: AppCredentials) => PlatformAdapter> = {
  youtube,
  facebook,
  instagram,
  threads,
  x,
  linkedin,
  tiktok,
  pinterest,
};

/**
 * Returns the adapter for a platform, reading credentials through `env`
 * (process.env in Node, Deno.env.get in Edge Functions).
 */
export function getAdapter(platform: PlatformKey, env: (name: string) => string | undefined): PlatformAdapter {
  const [idVar, secretVar] = CREDENTIAL_ENV[platform];
  const clientId = env(idVar);
  const clientSecret = env(secretVar);
  if (!clientId || !clientSecret) throw new Error(`${platform} is not configured: set ${idVar} and ${secretVar}`);
  return FACTORIES[platform]({ clientId, clientSecret, apiVersion: env(`${platform.toUpperCase()}_API_VERSION`) || undefined });
}

export function isConfigured(platform: PlatformKey, env: (name: string) => string | undefined) {
  const [idVar, secretVar] = CREDENTIAL_ENV[platform];
  return Boolean(env(idVar) && env(secretVar));
}
