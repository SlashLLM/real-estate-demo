// Refreshes the TotalWeb modules. They are vendored in vendor/totalweb (committed, so hosts like Vercel can install
// them) and installed from there as `file:` dependencies. First re-copy vendor/totalweb from the TotalWeb repo's packages/
// ($TOTALWEB_DIR, else C:/SlashLLM/TotalWeb; skipped where that folder doesn't exist, e.g. on a build server).
// pnpm keeps its first copy of a file: dependency and skips installs it thinks are up to date, so plain
// `pnpm install --force` never picks up new or changed module files. Drop the copies and pnpm's
// "already up to date" state, then install again.
// Afterwards, copy any new module migrations into supabase/migrations so `npx supabase db push` applies them.
import { execSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";

const SOURCE = `${(process.env.TOTALWEB_DIR || "C:/SlashLLM/TotalWeb").replaceAll("\\", "/")}/packages`;
const MODULES = ["blog", "crm", "social", "supabase", "ui"];
if (existsSync(SOURCE)) {
  for (const m of MODULES) {
    rmSync(`vendor/totalweb/${m}`, { recursive: true, force: true });
    cpSync(`${SOURCE}/${m}`, `vendor/totalweb/${m}`, { recursive: true });
    rmSync(`vendor/totalweb/${m}/node_modules`, { recursive: true, force: true });
  }
  console.log(`vendor/totalweb refreshed from ${SOURCE}. Commit it so deploys get the same modules.`);
}

const store = "node_modules/.pnpm";
if (existsSync(store)) {
  for (const dir of readdirSync(store)) if (dir.startsWith("@totalweb+")) rmSync(`${store}/${dir}`, { recursive: true, force: true });
}
rmSync("node_modules/@totalweb", { recursive: true, force: true });
for (const state of readdirSync("node_modules").filter((f) => f.startsWith(".pnpm-workspace-state"))) rmSync(`node_modules/${state}`);
execSync("pnpm install", { stdio: "inherit" });

// Migrations already in supabase/migrations are left alone (applied migrations must not change); new ones are added.
mkdirSync("supabase/migrations", { recursive: true });
const added = [];
for (const pkg of readdirSync("node_modules/@totalweb")) {
  const dir = `node_modules/@totalweb/${pkg}/migrations`;
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const dest = `supabase/migrations/${file}`;
    if (existsSync(dest)) continue;
    copyFileSync(`${dir}/${file}`, dest);
    added.push(file);
  }
}
console.log(added.length ? `New migrations: ${added.join(", ")}. Apply them with: npx supabase db push` : "Migrations: up to date.");
