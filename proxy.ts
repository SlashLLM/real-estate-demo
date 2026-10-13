import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@totalweb/supabase/middleware";

// Refresh the Supabase session; the admin area (social manager + CRM) requires sign-in.
export function proxy(request: NextRequest) {
  // Until Supabase keys are in .env.local the session helper throws on every request, taking the public site down
  // with it. Fail closed for /admin (straight to /login) and let the public pages render.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (request.nextUrl.pathname.startsWith("/admin")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  return updateSession(request, { protectedPrefixes: ["/admin"] });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/crm/forms|api/social/engine|api/social/cron|api/blog/engine|api/autopilot/cron|.*\.(?:png|jpg|jpeg|webp|svg|gif|ico|mp4)$).*)"],
};
