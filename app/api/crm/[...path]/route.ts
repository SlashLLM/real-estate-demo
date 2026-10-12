import { createCrmHandlers } from "@totalweb/crm/server";

// In production, restrict to the client website origins, e.g. ["https://client-site.com"].
export const { GET, POST, OPTIONS } = createCrmHandlers({ allowedOrigins: ["*"] });
