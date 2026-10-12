import { PlatformError } from "./types.ts";

export interface RequestOptions extends Omit<RequestInit, "body"> {
  json?: unknown;
  form?: Record<string, string | undefined>;
  body?: BodyInit;
  query?: Record<string, string | number | boolean | undefined>;
  bearer?: string;
  /** Retries for 429/5xx/network errors (exponential backoff, honours Retry-After). */
  retries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function withQuery(url: string, query?: RequestOptions["query"]) {
  if (!query) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) if (v !== undefined) u.searchParams.set(k, String(v));
  return u.toString();
}

/** fetch wrapper: JSON/form bodies, bearer auth, retry with backoff, typed PlatformError on failure. */
export async function request(url: string, opts: RequestOptions = {}): Promise<Response> {
  const { json, form, query, bearer, retries = 3, headers: rawHeaders, ...init } = opts;
  const headers = new Headers(rawHeaders);
  let body = opts.body;
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  } else if (form) {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
    body = new URLSearchParams(Object.entries(form).filter(([, v]) => v !== undefined) as [string, string][]).toString();
  }
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);

  const target = withQuery(url, query);
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(target, { ...init, headers, body });
    } catch (err) {
      if (attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new PlatformError(`Network error: ${(err as Error).message}`, 0, true);
    }
    if (res.ok) return res;

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < retries) {
      const after = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 30_000) : 500 * 2 ** attempt + Math.random() * 250);
      continue;
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {}
    throw new PlatformError(`${init.method ?? "GET"} ${new URL(url).pathname} → ${res.status}: ${summarise(parsed)}`, res.status, retryable, parsed);
  }
}

export async function requestJson<T = any>(url: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(url, opts);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** Downloads media from a signed URL (needed by platforms that take raw bytes). */
export async function fetchBytes(url: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string }> {
  const res = await request(url, { retries: 2 });
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: res.headers.get("content-type") ?? "application/octet-stream" };
}

function summarise(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 300);
  const b = body as any;
  return String(b?.error?.message ?? b?.error_description ?? b?.message ?? b?.detail ?? b?.title ?? JSON.stringify(body)).slice(0, 300);
}

export const basicAuth = (id: string, secret: string) => `Basic ${btoa(`${id}:${secret}`)}`;

export const expiresAt = (seconds?: number | string | null) =>
  seconds ? Date.now() + Number(seconds) * 1000 : undefined;
