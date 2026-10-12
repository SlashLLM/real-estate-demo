// Runtime-agnostic types shared by the Next.js app and Supabase Edge Functions (Deno).
// Files under core/ use only Web APIs (fetch, crypto.subtle) and explicit .ts imports.

export type PlatformKey = "youtube" | "tiktok" | "instagram" | "facebook" | "x" | "linkedin" | "threads" | "pinterest";

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms when accessToken expires. */
  expiresAt?: number;
  scope?: string;
  /** Platform-specific extras, e.g. a Facebook page access token. */
  extra?: Record<string, string>;
}

/** One connectable identity returned by an OAuth exchange (a channel, a page, a profile...). */
export interface ConnectedAccount {
  externalId: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  tokens: TokenSet;
  settings?: Record<string, unknown>;
}

export interface AccountContext {
  externalId: string;
  tokens: TokenSet;
  settings: Record<string, unknown>;
}

export interface MediaRef {
  /** Publicly fetchable URL (signed storage URL). */
  url: string;
  mime: string;
  kind: "image" | "video";
  sizeBytes?: number;
}

export interface PublishInput {
  text: string;
  title?: string;
  link?: string;
  tags?: string[];
  media: MediaRef[];
  options: Record<string, unknown>;
}

export interface PublishResult {
  externalId: string;
  url?: string;
  /** "processing" when the platform finishes asynchronously; poll with checkStatus. */
  status: "published" | "processing";
}

export interface PostMetrics {
  impressions?: number;
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  watchTimeS?: number;
  raw?: unknown;
}

export interface AccountMetrics {
  followers?: number;
  following?: number;
  postsCount?: number;
  raw?: unknown;
}

export interface AppCredentials {
  clientId: string;
  clientSecret: string;
  /** Overrides a versioned API's pinned version (e.g. LINKEDIN_API_VERSION=202609). */
  apiVersion?: string;
}

export interface PlatformAdapter {
  key: PlatformKey;
  usesPkce: boolean;
  authorizeUrl(p: { state: string; redirectUri: string; codeChallenge?: string }): string;
  exchangeCode(p: { code: string; redirectUri: string; codeVerifier?: string }): Promise<ConnectedAccount[]>;
  /** Returns fresh tokens. Absent for platforms whose tokens don't refresh (they re-auth instead). */
  refresh?(tokens: TokenSet): Promise<TokenSet>;
  publish(account: AccountContext, input: PublishInput): Promise<PublishResult>;
  /** For async platforms: resolves a processing publish into its final state. */
  checkStatus?(account: AccountContext, externalId: string): Promise<PublishResult | { status: "failed"; error: string }>;
  fetchPostMetrics(account: AccountContext, externalIds: string[]): Promise<Record<string, PostMetrics>>;
  fetchAccountMetrics(account: AccountContext): Promise<AccountMetrics>;
}

export class PlatformError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "PlatformError";
  }
  /** True when the user must reconnect the account. */
  get authExpired() {
    return this.status === 401;
  }
}
