import { mkdirSync, writeFileSync } from "node:fs";
import { AUTH_DIR, SEED_FILE, newTestUser } from "./support/constants";
import { createSeed, deleteStaleTestUsers } from "./support/db";

/** Fresh throwaway admin + workspace for this run (and removes any left behind by an aborted run). */
export default async function globalSetup() {
  await deleteStaleTestUsers();
  const { email, password } = newTestUser();
  const seed = await createSeed(email, password);
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
}
