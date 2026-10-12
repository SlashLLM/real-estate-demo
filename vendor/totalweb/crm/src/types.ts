export const LIFECYCLE_STAGES = [
  "subscriber",
  "lead",
  "mql",
  "sql",
  "opportunity",
  "customer",
  "evangelist",
  "other",
] as const;
export type Lifecycle = (typeof LIFECYCLE_STAGES)[number];

export type ActivityType = "note" | "call" | "email" | "meeting" | "form_submission" | "social" | "system";
export type DealStatus = "open" | "won" | "lost";

export interface Company {
  id: string;
  workspace_id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  phone: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  workspace_id: string;
  company_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  lifecycle_stage: Lifecycle;
  source: string | null;
  source_detail: Record<string, unknown>;
  custom_fields: Record<string, unknown>;
  last_activity_at: string | null;
  created_at: string;
  company?: Pick<Company, "id" | "name"> | null;
}

export interface Stage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability: number;
  kind: DealStatus;
}

export interface Deal {
  id: string;
  pipeline_id: string;
  stage_id: string;
  title: string;
  amount: number;
  currency: string;
  status: DealStatus;
  contact_id: string | null;
  company_id: string | null;
  expected_close: string | null;
  position: number;
  contact?: Pick<Contact, "id" | "first_name" | "last_name"> | null;
  company?: Pick<Company, "id" | "name"> | null;
}

export interface Activity {
  id: string;
  type: ActivityType;
  subject: string | null;
  body: string | null;
  occurred_at: string;
  meta: Record<string, unknown>;
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  status: "open" | "done" | "cancelled";
  contact_id: string | null;
  deal_id: string | null;
  contact?: Pick<Contact, "id" | "first_name" | "last_name"> | null;
}

export interface LeadFormField {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select" | "checkbox";
  required?: boolean;
  options?: string[];
}

export interface LeadForm {
  id: string;
  name: string;
  fields: LeadFormField[];
  success_message: string;
  is_active: boolean;
}

export const contactName = (c: Pick<Contact, "first_name" | "last_name"> & { email?: string | null }) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Unnamed";
