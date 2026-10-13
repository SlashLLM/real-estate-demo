// Shared settings for the admin e2e suite. The suite runs its own `next dev` on APP_PORT with test-only overrides
// (a stub content engine, a throwaway token key), so it never needs the real engine or touches .env.local.
import { randomBytes } from "node:crypto";

export const APP_PORT = 3100;
export const ENGINE_PORT = 8799;
export const APP_URL = `http://localhost:${APP_PORT}`;
export const ENGINE_URL = `http://127.0.0.1:${ENGINE_PORT}`;

/** HMAC secret shared by the app and the stub engine for this run only. */
export const ENGINE_SECRET = "e2e-stub-engine-secret";
/** x-cron-secret for the autopilot tick route during the run. */
export const CRON_SECRET = "e2e-cron-secret";
/** AES key for encrypted tokens / demo-login passwords written during the run (test data only). */
export const TOKEN_ENC_KEY = Buffer.alloc(32, 7).toString("base64");

export const AUTH_DIR = "e2e/.auth";
export const STORAGE_STATE = `${AUTH_DIR}/admin.json`;
export const SEED_FILE = `${AUTH_DIR}/seed.json`;

/** Every user the suite creates matches this, so stale ones from aborted runs can be found and removed. */
export const TEST_EMAIL_PREFIX = "e2e-admin-";
export const TEST_EMAIL_DOMAIN = "example.com";

export const newTestUser = () => ({
  email: `${TEST_EMAIL_PREFIX}${Date.now().toString(36)}@${TEST_EMAIL_DOMAIN}`,
  password: `E2e!${randomBytes(12).toString("hex")}`,
});
