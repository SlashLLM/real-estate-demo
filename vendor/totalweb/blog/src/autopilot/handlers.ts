import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@totalweb/social/core";
import { PUBLIC_BASE } from "../server/env";
import { runAutopilotTick, type TickSummary } from "./tick";

/** Public blog surfaces to refresh after autopilot published articles. */
export function revalidatePublished(summary: Pick<TickSummary, "published">) {
  if (!summary.published.length) return;
  revalidatePath(PUBLIC_BASE);
  for (const slug of summary.published) revalidatePath(`${PUBLIC_BASE}/${slug}`);
  revalidatePath("/sitemap.xml");
  revalidatePath(`${PUBLIC_BASE}/rss.xml`);
}

/**
 * Route handlers for the autopilot. Mount in the host app at `app/api/autopilot/[...path]/route.ts`:
 *
 *   export const { POST } = createAutopilotHandlers();
 *   export const maxDuration = 60;
 *
 * Routes:
 *   POST cron   the tick (pg_cron via pg_net every 5 minutes, or any external cron); header x-cron-secret: CRON_SECRET
 */
export function createAutopilotHandlers() {
  async function POST(req: NextRequest) {
    const path = req.nextUrl.pathname.replace(/^.*?\/api\/autopilot\/?/, "");
    if (path !== "cron") return NextResponse.json({ error: "Not found" }, { status: 404 });
    const secret = process.env.CRON_SECRET;
    const given = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!secret || !safeEqual(secret, given)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const summary = await runAutopilotTick();
    revalidatePublished(summary);
    if (summary.errors.length) console.warn("autopilot:", summary.errors);
    return NextResponse.json(summary);
  }
  return { POST };
}
