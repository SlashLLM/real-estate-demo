import { NextResponse, type NextRequest } from "next/server";
import { handleBlogCallback } from "./engine";

/**
 * Route handlers for the blog module. Mount in the host app at
 * `app/api/blog/[...path]/route.ts`:
 *
 *   export const { POST } = createBlogHandlers();
 *
 * Routes:
 *   POST engine/callback   ConGenEng article results (HMAC-signed)
 */
export function createBlogHandlers() {
  const segments = (req: NextRequest) => req.nextUrl.pathname.replace(/^.*?\/api\/blog\/?/, "").split("/").filter(Boolean);

  async function POST(req: NextRequest) {
    const [a, b] = segments(req);
    if (a === "engine" && b === "callback") return handleBlogCallback(req);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return { POST };
}
