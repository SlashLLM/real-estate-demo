import { createSocialHandlers } from "@totalweb/social/server";

export const { GET, POST } = createSocialHandlers();
// Publishing and media uploads can take a while (used by the cron fallback route).
export const maxDuration = 300;
