import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@totalweb/supabase/admin";
import { submitLeadForm } from "./intake";

/**
 * Route handlers for the CRM's public API. Mount in the host app at
 * `app/api/crm/[...path]/route.ts`:
 *
 *   export const { GET, POST, OPTIONS } = createCrmHandlers();
 *
 * Routes:
 *   GET  /api/crm/forms/:id          public form definition (for embedding on any site)
 *   POST /api/crm/forms/:id/submit   public lead intake (JSON or form-encoded); `_cta` or the page's
 *                                    `?cta=` names the website CTA, shown in the CRM as the lead's source
 */
export function createCrmHandlers({ allowedOrigins = ["*"] }: { allowedOrigins?: string[] } = {}) {
  const cors = (req: NextRequest) => {
    const origin = req.headers.get("origin") ?? "";
    const allow = allowedOrigins.includes("*") ? "*" : allowedOrigins.includes(origin) ? origin : "";
    return {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
  };

  const segments = (req: NextRequest) =>
    req.nextUrl.pathname.replace(/^.*?\/api\/crm\/?/, "").split("/").filter(Boolean);

  async function GET(req: NextRequest) {
    const [resource, id] = segments(req);
    if (resource === "forms" && id) {
      const { data } = await createAdminClient()
        .from("crm_lead_forms")
        .select("id, name, fields, success_message, is_active")
        .eq("id", id)
        .maybeSingle();
      if (!data?.is_active) return NextResponse.json({ error: "Not found" }, { status: 404, headers: cors(req) });
      return NextResponse.json(data, { headers: cors(req) });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  async function POST(req: NextRequest) {
    const [resource, id, action] = segments(req);
    if (resource !== "forms" || !id || action !== "submit") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const type = req.headers.get("content-type") ?? "";
    const payload: Record<string, unknown> = type.includes("application/json")
      ? await req.json().catch(() => ({}))
      : Object.fromEntries((await req.formData()).entries());

    const referer = req.headers.get("referer");
    const utm: Record<string, string> = {};
    let refererCta: string | null = null;
    if (referer) {
      try {
        const params = new URL(referer).searchParams;
        params.forEach((v, k) => k.startsWith("utm_") && (utm[k] = v));
        refererCta = params.get("cta");
      } catch {}
    }

    const result = await submitLeadForm(id, payload, {
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip"),
      userAgent: req.headers.get("user-agent"),
      pageUrl: (payload._page as string) ?? referer,
      utm,
      cta: (payload._cta as string) ?? refererCta,
    });

    // Plain HTML form posts (no JS) get redirected back to the page.
    if (!type.includes("application/json") && referer) {
      const back = new URL(referer);
      back.searchParams.set("submitted", result.ok ? "1" : "0");
      return NextResponse.redirect(back, 303);
    }
    return result.ok
      ? NextResponse.json({ ok: true, message: result.message }, { headers: cors(req) })
      : NextResponse.json(result, { status: result.status, headers: cors(req) });
  }

  async function OPTIONS(req: NextRequest) {
    return new NextResponse(null, { status: 204, headers: cors(req) });
  }

  return { GET, POST, OPTIONS };
}
