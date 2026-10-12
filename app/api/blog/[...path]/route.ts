import { createBlogHandlers } from "@totalweb/blog/server";

// ConGenEng delivers finished articles here (HMAC-signed); they land in the review queue as drafts.
export const { POST } = createBlogHandlers();
