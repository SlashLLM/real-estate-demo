/** Where the host app mounts the blog API, admin pages and public pages. */
export const API_BASE = process.env.TOTALWEB_BLOG_API ?? "/api/blog";
export const UI_BASE = process.env.TOTALWEB_BLOG_BASE ?? "/admin/blog";
export const PUBLIC_BASE = "/blog";

/**
 * The workspace whose posts this site shows publicly. Client sites share one Supabase project (one workspace
 * per client), so there is no safe default: until TOTALWEB_WORKSPACE_ID is set the public blog is empty.
 */
export const publicWorkspaceId = (): string | null => process.env.TOTALWEB_WORKSPACE_ID || null;
