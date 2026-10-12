import { createHash } from "node:crypto";
import { createAdminClient } from "@totalweb/supabase/admin";
import type { LeadFormField } from "../types";

/** Field names that map onto crm_contacts columns; everything else goes to custom_fields. */
const CONTACT_COLUMNS = ["first_name", "last_name", "email", "phone", "job_title"] as const;
const HONEYPOT = "_hp";
const MAX_PER_IP_PER_10MIN = 5;

export type IntakeResult =
  | { ok: true; message: string; contactId: string }
  | { ok: false; status: number; error: string; fieldErrors?: Record<string, string> };

/** Pure validation of a submission against a form's field definitions. */
export function validateSubmission(fields: LeadFormField[], payload: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  const clean: Record<string, string | boolean> = {};
  for (const f of fields) {
    const raw = payload[f.name];
    if (f.type === "checkbox") {
      clean[f.name] = raw === true || raw === "on" || raw === "true";
      if (f.required && !clean[f.name]) errors[f.name] = "Required";
      continue;
    }
    const value = typeof raw === "string" ? raw.trim().slice(0, 5000) : "";
    if (f.required && !value) errors[f.name] = "Required";
    else if (value && f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[f.name] = "Invalid email";
    else if (value && f.type === "select" && f.options && !f.options.includes(value)) errors[f.name] = "Invalid option";
    if (value) clean[f.name] = value;
  }
  return { errors, clean };
}

/** Normalises a website CTA id (e.g. "hero-book-call") or returns null when there isn't one. */
export function ctaId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return id || null;
}

/** Splits cleaned values into contact columns and custom fields. */
export function mapToContact(clean: Record<string, string | boolean>) {
  const contact: Record<string, string> = {};
  const custom: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(clean)) {
    if ((CONTACT_COLUMNS as readonly string[]).includes(k) && typeof v === "string") contact[k] = v;
    else custom[k] = v;
  }
  if (contact.email) contact.email = contact.email.toLowerCase();
  return { contact, custom };
}

/**
 * Public lead intake. Runs with the service role because the submitter is anonymous;
 * all writes are scoped to the form's workspace.
 */
export async function submitLeadForm(
  formId: string,
  payload: Record<string, unknown>,
  meta: {
    ip?: string | null;
    userAgent?: string | null;
    pageUrl?: string | null;
    utm?: Record<string, string>;
    /** Which website CTA led to this submission (see ctaId). */
    cta?: string | null;
  },
): Promise<IntakeResult> {
  // Bots fill the hidden honeypot field: pretend success, store nothing.
  if (typeof payload[HONEYPOT] === "string" && payload[HONEYPOT]) {
    return { ok: true, message: "Thanks!", contactId: "" };
  }

  const db = createAdminClient();
  const { data: form } = await db.from("crm_lead_forms").select("*").eq("id", formId).maybeSingle();
  if (!form || !form.is_active) return { ok: false, status: 404, error: "Form not found" };

  const ipHash = meta.ip
    ? createHash("sha256").update(`${meta.ip}:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`).digest("hex")
    : null;
  if (ipHash) {
    const { count } = await db
      .from("crm_form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("meta->>ip_hash", ipHash)
      .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
    if ((count ?? 0) >= MAX_PER_IP_PER_10MIN) return { ok: false, status: 429, error: "Too many submissions" };
  }

  const { errors, clean } = validateSubmission(form.fields as LeadFormField[], payload);
  if (Object.keys(errors).length) return { ok: false, status: 422, error: "Validation failed", fieldErrors: errors };

  const ws = form.workspace_id as string;
  const { contact, custom } = mapToContact(clean);
  const cta = ctaId(meta.cta);
  const sourceDetail = { form_id: formId, page_url: meta.pageUrl ?? null, utm: meta.utm ?? {}, cta };

  // Merge into an existing contact by email, otherwise create one.
  let contactId: string | null = null;
  if (contact.email) {
    const { data: existing } = await db
      .from("crm_contacts")
      .select("id, custom_fields")
      .eq("workspace_id", ws)
      .ilike("email", contact.email)
      .maybeSingle();
    if (existing) {
      contactId = existing.id;
      const patch = Object.fromEntries(Object.entries(contact).filter(([, v]) => v));
      await db
        .from("crm_contacts")
        .update({ ...patch, custom_fields: { ...(existing.custom_fields ?? {}), ...custom } })
        .eq("id", contactId);
    }
  }
  if (!contactId) {
    const { data: created, error } = await db
      .from("crm_contacts")
      .insert({
        ...contact,
        workspace_id: ws,
        lifecycle_stage: form.default_lifecycle,
        source: cta
          ? `website_cta:${cta}`
          : meta.utm?.utm_source
            ? `website_form:${meta.utm.utm_source}`
            : "website_form",
        source_detail: sourceDetail,
        custom_fields: custom,
      })
      .select("id")
      .single();
    if (error) return { ok: false, status: 500, error: error.message };
    contactId = created.id;
  }

  await db.from("crm_form_submissions").insert({
    workspace_id: ws,
    form_id: formId,
    contact_id: contactId,
    payload: clean,
    meta: { ip_hash: ipHash, user_agent: meta.userAgent ?? null, page_url: meta.pageUrl ?? null, utm: meta.utm ?? {}, cta },
  });
  await db.from("crm_activities").insert({
    workspace_id: ws,
    contact_id: contactId,
    type: "form_submission",
    subject: cta ? `Submitted "${form.name}" via CTA "${cta}"` : `Submitted "${form.name}"`,
    body: typeof clean.message === "string" ? clean.message : null,
    meta: sourceDetail,
  });

  if (form.auto_create_deal) {
    const { data: stage } = await db
      .from("crm_pipeline_stages")
      .select("id, pipeline_id, crm_pipelines!inner(is_default)")
      .eq("workspace_id", ws)
      .eq("crm_pipelines.is_default", true)
      .order("position")
      .limit(1)
      .maybeSingle();
    if (stage) {
      await db.from("crm_deals").insert({
        workspace_id: ws,
        pipeline_id: stage.pipeline_id,
        stage_id: stage.id,
        contact_id: contactId,
        title: `Inbound: ${contact.first_name ?? contact.email ?? "website lead"}`,
        position: Date.now(),
      });
    }
  }

  return { ok: true, message: form.success_message, contactId: contactId! };
}
