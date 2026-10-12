# PropertyPro AI: TotalWeb site

Generated from `C:/SlashLLM/TotalWeb/templates/site`. Reusable modules come from `C:/SlashLLM/TotalWeb/packages`
(installed as `file:` deps; refresh with `pnpm totalweb:update`).

| Path | What |
|---|---|
| `app/(site)/**` | The public website. **Yours to redesign.** Keep `/contact` using `<LeadCaptureForm/>`. |
| `app/globals.css` | Design tokens. Set `--tw-*` so the admin area matches the brand. |
| `site.config.ts` | Name, copy, nav, contact, brand profile (also used by the content engine). |
| `app/admin/**` | Social manager, AI studio (ConGenEng), CRM. Mounted modules; don't rewrite. |
| `app/api/{social,crm}/**` | Module API routes (OAuth, uploads, engine callback, public lead intake). |

Run: `pnpm install && pnpm dev` → http://localhost:3000 · admin at /admin (create the user in Supabase: Authentication > Users > Add user, then sign in at /login).
Admin e2e tests: `pnpm test:e2e` (Playwright, ~4 min). The suite starts its own `next dev` on :3100 with a stub content engine
(`e2e/stub-engine.mjs`), creates a throwaway `e2e-admin-*@example.com` user + workspace in Supabase, and deletes them afterwards
(`E2E_KEEP_DATA=1` keeps them, `E2E_SERVER_LOGS=1` shows server output).

Any page can capture leads: `import { LeadCaptureForm } from "@totalweb/crm/components"`.
