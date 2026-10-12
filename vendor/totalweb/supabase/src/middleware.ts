import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on every request.
 * `protectedPrefixes` are redirected to `loginPath` when no user is signed in.
 */
export async function updateSession(
  request: NextRequest,
  { protectedPrefixes = [] as string[], loginPath = "/login" } = {},
) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!data.user && protectedPrefixes.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = loginPath;
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return response;
}
