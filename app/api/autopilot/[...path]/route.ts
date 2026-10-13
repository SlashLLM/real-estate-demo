import { createAutopilotHandlers } from "@totalweb/blog/autopilot";

// The autopilot tick: pg_cron (via pg_net, Vault secret site_url) or any external cron POSTs here every 5 minutes
// with x-cron-secret: CRON_SECRET. It starts due runs and publishes what the engine has delivered.
export const { POST } = createAutopilotHandlers();
export const maxDuration = 60;
