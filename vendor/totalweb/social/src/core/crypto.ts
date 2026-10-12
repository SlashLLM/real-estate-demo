// AES-256-GCM token encryption with Web Crypto (works in Node 20+, Deno and edge runtimes).
// Format: base64( 12-byte IV || ciphertext+tag ), prefixed with "v1:" for key rotation later.
import type { TokenSet } from "./types.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const keyCache = new Map<string, Promise<CryptoKey>>();
function importKey(base64Key: string) {
  let key = keyCache.get(base64Key);
  if (!key) {
    const raw = b64ToBytes(base64Key);
    if (raw.length !== 32) throw new Error("TOKEN_ENC_KEY must be 32 bytes, base64-encoded");
    key = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    keyCache.set(base64Key, key);
  }
  return key;
}

export async function encryptTokens(tokens: TokenSet, base64Key: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(base64Key), enc.encode(JSON.stringify(tokens))),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return `v1:${bytesToB64(out)}`;
}

export async function decryptTokens(payload: string, base64Key: string): Promise<TokenSet> {
  if (!payload.startsWith("v1:")) throw new Error("Unknown token ciphertext version");
  const bytes = b64ToBytes(payload.slice(3));
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.subarray(0, 12) },
    await importKey(base64Key),
    bytes.subarray(12),
  );
  return JSON.parse(dec.decode(pt));
}

// ---------------------------------------------------------------------------
// PKCE + state helpers
// ---------------------------------------------------------------------------
export function randomToken(bytes = 32): string {
  return bytesToB64(crypto.getRandomValues(new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier)));
  return bytesToB64(digest).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** HMAC-SHA256 hex signature (used for ConGenEng requests/callbacks). */
export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
