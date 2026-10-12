export const env = (name: string) => process.env[name];

export function encKey() {
  const key = process.env.TOKEN_ENC_KEY;
  if (!key) throw new Error("TOKEN_ENC_KEY is not set (openssl rand -base64 32)");
  return key;
}

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Where the host app mounts the social API and pages. */
export const API_BASE = process.env.TOTALWEB_SOCIAL_API ?? "/api/social";
export const UI_BASE = process.env.TOTALWEB_SOCIAL_BASE ?? "/social";

export const redirectUri = (platform: string) => `${siteUrl()}${API_BASE}/callback/${platform}`;
