import { createClient } from "@totalweb/supabase/server";
import { requireWorkspace } from "@totalweb/supabase/workspace";
import type { Activity, Company, Contact, Deal, LeadForm, Stage, Task } from "../types";

async function ctx() {
  const [supabase, workspace] = await Promise.all([createClient(), requireWorkspace()]);
  return { supabase, ws: workspace.id };
}

function rows<T>(res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function listContacts({ q, stage, limit = 200 }: { q?: string; stage?: string; limit?: number } = {}) {
  const { supabase, ws } = await ctx();
  let query = supabase
    .from("crm_contacts")
    .select("*, company:crm_companies(id, name)")
    .eq("workspace_id", ws)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (stage) query = query.eq("lifecycle_stage", stage);
  if (q) {
    const term = q.replace(/[%,()]/g, " ");
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  return rows<Contact[]>(await query);
}

export async function getContact(id: string) {
  const { supabase } = await ctx();
  const [contact, activities, deals, tasks] = await Promise.all([
    supabase.from("crm_contacts").select("*, company:crm_companies(id, name)").eq("id", id).single(),
    supabase.from("crm_activities").select("*").eq("contact_id", id).order("occurred_at", { ascending: false }),
    supabase.from("crm_deals").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("crm_tasks").select("*").eq("contact_id", id).order("due_at", { ascending: true }),
  ]);
  return {
    contact: rows<Contact>(contact),
    activities: rows<Activity[]>(activities),
    deals: rows<Deal[]>(deals),
    tasks: rows<Task[]>(tasks),
  };
}

export async function listCompanies() {
  const { supabase, ws } = await ctx();
  return rows<(Company & { contacts: { count: number }[] })[]>(
    await supabase
      .from("crm_companies")
      .select("*, contacts:crm_contacts(count)")
      .eq("workspace_id", ws)
      .order("name"),
  );
}

export async function getPipelineBoard(pipelineId?: string) {
  const { supabase, ws } = await ctx();
  const pipelines = rows<{ id: string; name: string; is_default: boolean }[]>(
    await supabase.from("crm_pipelines").select("id, name, is_default").eq("workspace_id", ws).order("created_at"),
  );
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines.find((p) => p.is_default) ?? pipelines[0];
  if (!pipeline) return { pipelines, pipeline: null, stages: [] as Stage[], deals: [] as Deal[] };
  const [stages, deals] = await Promise.all([
    supabase.from("crm_pipeline_stages").select("*").eq("pipeline_id", pipeline.id).order("position"),
    supabase
      .from("crm_deals")
      .select("*, contact:crm_contacts(id, first_name, last_name), company:crm_companies(id, name)")
      .eq("pipeline_id", pipeline.id)
      .order("position"),
  ]);
  return { pipelines, pipeline, stages: rows<Stage[]>(stages), deals: rows<Deal[]>(deals) };
}

export async function listTasks(status: "open" | "done" = "open") {
  const { supabase, ws } = await ctx();
  return rows<Task[]>(
    await supabase
      .from("crm_tasks")
      .select("*, contact:crm_contacts(id, first_name, last_name)")
      .eq("workspace_id", ws)
      .eq("status", status)
      .order("due_at", { ascending: true, nullsFirst: false }),
  );
}

/** How many tasks are open and done, for the Open / Closed switch. */
export async function countTasks() {
  const { supabase, ws } = await ctx();
  const count = (status: "open" | "done") =>
    supabase.from("crm_tasks").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("status", status);
  const [open, done] = await Promise.all([count("open"), count("done")]);
  return { open: open.count ?? 0, done: done.count ?? 0 };
}

export async function getDashboard() {
  const { supabase, ws } = await ctx();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [summary, newContacts, bySource, openTasks, closed] = await Promise.all([
    supabase.from("crm_pipeline_summary").select("*").eq("workspace_id", ws).order("position"),
    supabase.from("crm_contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ws).gte("created_at", since),
    supabase.from("crm_contacts").select("source, source_detail").eq("workspace_id", ws).gte("created_at", since),
    supabase.from("crm_tasks").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("status", "open"),
    supabase.from("crm_deals").select("status, amount").eq("workspace_id", ws).neq("status", "open").gte("closed_at", since),
  ]);
  const closedRows = rows<{ status: string; amount: number }[]>(closed);
  const won = closedRows.filter((d) => d.status === "won");
  const sources: Record<string, number> = {};
  // Same leads, split by the page they converted on, so a site-wide CTA (header, footer) shows where it worked.
  const breakdown = new Map<string, LeadSourceRow>();
  for (const r of rows<{ source: string | null; source_detail: Record<string, unknown> | null }[]>(bySource)) {
    const source = r.source ?? "unknown";
    sources[source] = (sources[source] ?? 0) + 1;
    const page = pagePath(r.source_detail?.page_url);
    const cta = source.startsWith("website_cta:") ? source.slice("website_cta:".length) : null;
    const key = `${source}|${page ?? ""}`;
    const row = breakdown.get(key) ?? { source, cta, page, count: 0 };
    row.count++;
    breakdown.set(key, row);
  }
  return {
    stages: rows<
      { stage_id: string; stage_name: string; kind: string; deal_count: number; total_amount: number; weighted_amount: number }[]
    >(summary),
    newContacts30d: newContacts.count ?? 0,
    openTasks: openTasks.count ?? 0,
    wonAmount30d: won.reduce((s, d) => s + Number(d.amount), 0),
    winRate30d: closedRows.length ? won.length / closedRows.length : null,
    sources,
    sourceBreakdown: [...breakdown.values()].sort((a, b) => b.count - a.count),
  };
}

export type LeadSourceRow = { source: string; cta: string | null; page: string | null; count: number };

/**
 * The page a lead converted from: "http://site.com/pricing?cta=x#quote" → "/pricing". Link CTAs land on
 * the contact page, so a `from=<path>` query param (set by the site's CTA links) wins over the URL's own path.
 * Null when the lead has no page URL.
 */
function pagePath(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  try {
    const u = new URL(url);
    const from = u.searchParams.get("from");
    const path = from && from.startsWith("/") ? from.split(/[?#]/)[0] : u.pathname;
    return path.replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
}

export async function listLeadForms() {
  const { supabase, ws } = await ctx();
  return rows<LeadForm[]>(await supabase.from("crm_lead_forms").select("*").eq("workspace_id", ws).order("created_at"));
}
