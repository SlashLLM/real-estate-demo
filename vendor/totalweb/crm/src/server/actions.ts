"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@totalweb/supabase/server";
import { requireWorkspace } from "@totalweb/supabase/workspace";
import { LIFECYCLE_STAGES } from "../types";

/** Base path the host app mounts the CRM pages under; used for revalidation. */
const CRM_BASE = process.env.TOTALWEB_CRM_BASE ?? "/crm";

async function ctx() {
  const [supabase, workspace] = await Promise.all([createClient(), requireWorkspace()]);
  return { supabase, ws: workspace.id };
}

function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

const blankToNull = z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional());

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------
const contactSchema = z.object({
  first_name: blankToNull,
  last_name: blankToNull,
  email: z.preprocess((v) => (v === "" ? null : v), z.email().nullable().optional()),
  phone: blankToNull,
  job_title: blankToNull,
  company_id: blankToNull,
  lifecycle_stage: z.enum(LIFECYCLE_STAGES).default("lead"),
  source: blankToNull,
});

/** Finds a workspace company by name (case-insensitive) or creates it; blank clears the link. */
async function resolveCompany(supabase: Awaited<ReturnType<typeof createClient>>, ws: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const pattern = trimmed.replace(/[\\%_]/g, (c) => `\\${c}`); // match the name literally, not as an ILIKE pattern
  const found = check(await supabase.from("crm_companies").select("id").eq("workspace_id", ws).ilike("name", pattern).limit(1));
  if (found.length) return found[0].id as string;
  const row = check(await supabase.from("crm_companies").insert({ name: trimmed, workspace_id: ws }).select("id").single());
  return row.id as string;
}

export async function saveContact(input: z.input<typeof contactSchema> & { id?: string; company_name?: string }) {
  const { supabase, ws } = await ctx();
  const values = contactSchema.parse(input);
  // Forms send the company as free text: link an existing company or create a new one.
  if (input.company_name !== undefined) values.company_id = await resolveCompany(supabase, ws, input.company_name);
  const row = input.id
    ? check(await supabase.from("crm_contacts").update(values).eq("id", input.id).select().single())
    : check(
        await supabase
          .from("crm_contacts")
          .insert({ ...values, workspace_id: ws, source: values.source ?? "manual" })
          .select()
          .single(),
      );
  revalidatePath(CRM_BASE, "layout");
  return row;
}

export async function deleteContact(id: string) {
  const { supabase } = await ctx();
  check(await supabase.from("crm_contacts").delete().eq("id", id));
  revalidatePath(CRM_BASE, "layout");
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------
const companySchema = z.object({
  name: z.string().min(1),
  domain: blankToNull,
  industry: blankToNull,
  size: blankToNull,
  phone: blankToNull,
});

export async function saveCompany(input: z.input<typeof companySchema> & { id?: string }) {
  const { supabase, ws } = await ctx();
  const values = companySchema.parse(input);
  const row = input.id
    ? check(await supabase.from("crm_companies").update(values).eq("id", input.id).select().single())
    : check(await supabase.from("crm_companies").insert({ ...values, workspace_id: ws }).select().single());
  revalidatePath(CRM_BASE, "layout");
  return row;
}

export async function deleteCompany(id: string) {
  const { supabase } = await ctx();
  check(await supabase.from("crm_companies").delete().eq("id", id));
  revalidatePath(CRM_BASE, "layout");
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------
const dealSchema = z.object({
  title: z.string().min(1),
  amount: z.coerce.number().min(0).default(0),
  currency: z.string().length(3).default("USD"),
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  contact_id: blankToNull,
  company_id: blankToNull,
  expected_close: blankToNull,
});

export async function saveDeal(input: z.input<typeof dealSchema> & { id?: string }) {
  const { supabase, ws } = await ctx();
  const values = dealSchema.parse(input);
  const row = input.id
    ? check(await supabase.from("crm_deals").update(values).eq("id", input.id).select().single())
    : check(
        await supabase
          .from("crm_deals")
          .insert({ ...values, workspace_id: ws, position: Date.now() })
          .select()
          .single(),
      );
  revalidatePath(CRM_BASE, "layout");
  return row;
}

/** Kanban drop: move a deal to a stage at a fractional position between its new neighbours. */
export async function moveDeal(id: string, stageId: string, position: number) {
  const { supabase, ws } = await ctx();
  const before = check(await supabase.from("crm_deals").select("stage_id").eq("id", id).single());
  check(await supabase.from("crm_deals").update({ stage_id: stageId, position }).eq("id", id));
  if (before.stage_id !== stageId) {
    const stage = check(await supabase.from("crm_pipeline_stages").select("name").eq("id", stageId).single());
    await supabase.from("crm_activities").insert({
      workspace_id: ws,
      deal_id: id,
      type: "system",
      subject: `Moved to ${stage.name}`,
    });
  }
  revalidatePath(CRM_BASE, "layout");
}

export async function deleteDeal(id: string) {
  const { supabase } = await ctx();
  check(await supabase.from("crm_deals").delete().eq("id", id));
  revalidatePath(CRM_BASE, "layout");
}

// ---------------------------------------------------------------------------
// Activities & tasks
// ---------------------------------------------------------------------------
const activitySchema = z.object({
  type: z.enum(["note", "call", "email", "meeting"]),
  subject: blankToNull,
  body: blankToNull,
  contact_id: blankToNull,
  company_id: blankToNull,
  deal_id: blankToNull,
  occurred_at: blankToNull,
});

export async function logActivity(input: z.input<typeof activitySchema>) {
  const { supabase, ws } = await ctx();
  const { occurred_at, ...values } = activitySchema.parse(input);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  check(
    await supabase.from("crm_activities").insert({
      ...values,
      ...(occurred_at ? { occurred_at } : {}),
      workspace_id: ws,
      created_by: user?.id,
    }),
  );
  revalidatePath(CRM_BASE, "layout");
}

const taskSchema = z.object({
  title: z.string().min(1),
  notes: blankToNull,
  due_at: blankToNull,
  contact_id: blankToNull,
  deal_id: blankToNull,
});

export async function saveTask(input: z.input<typeof taskSchema> & { id?: string }) {
  const { supabase, ws } = await ctx();
  const values = taskSchema.parse(input);
  if (input.id) check(await supabase.from("crm_tasks").update(values).eq("id", input.id));
  else check(await supabase.from("crm_tasks").insert({ ...values, workspace_id: ws }));
  revalidatePath(CRM_BASE, "layout");
}

export async function setTaskStatus(id: string, status: "open" | "done" | "cancelled") {
  const { supabase } = await ctx();
  check(
    await supabase
      .from("crm_tasks")
      .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
      .eq("id", id),
  );
  revalidatePath(CRM_BASE, "layout");
}
