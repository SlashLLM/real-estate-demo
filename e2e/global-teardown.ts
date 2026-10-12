import { existsSync } from "node:fs";
import { SEED_FILE } from "./support/constants";
import { deleteTestUser, readSeed } from "./support/db";

/** Removes this run's user, workspace and media. Set E2E_KEEP_DATA=1 to inspect them after a run. */
export default async function globalTeardown() {
  if (process.env.E2E_KEEP_DATA || !existsSync(SEED_FILE)) return;
  await deleteTestUser(readSeed().userId);
}
