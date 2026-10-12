import "server-only";
import { createAdminClient } from "@totalweb/supabase/admin";

/** The CRM lead form every website CTA posts to (same lookup as the scaffold's /contact page).
 *  Undefined until Supabase keys are set and the workspace exists. */
export async function leadFormId(): Promise<string | undefined> {
  if (process.env.CRM_LEAD_FORM_ID) return process.env.CRM_LEAD_FORM_ID;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return undefined;
  try {
    const { data } = await createAdminClient()
      .from("crm_lead_forms")
      .select("id")
      .eq("is_active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    return (data?.id as string | undefined) ?? undefined;
  } catch (err) {
    console.error("[lead-form] lookup failed:", (err as Error).message);
    return undefined;
  }
}
