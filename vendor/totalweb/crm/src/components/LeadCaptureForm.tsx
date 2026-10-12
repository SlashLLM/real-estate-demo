"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, Input, Label, Select, Textarea } from "@totalweb/ui";
import type { LeadForm } from "../types";

/**
 * Embeddable lead form for public website pages. Loads its definition from the CRM API
 * (or takes it via `form`) and posts to /api/crm/forms/:id/submit.
 * `apiBase` lets a site on another origin post to the CRM host.
 * `cta` names the website CTA this form belongs to (defaults to the page's `?cta=`); the CRM records it as the lead's source.
 */
export function LeadCaptureForm({
  formId,
  form: initial,
  apiBase = "",
  className,
  submitLabel = "Send",
  cta,
}: {
  formId: string;
  form?: LeadForm;
  apiBase?: string;
  className?: string;
  submitLabel?: string;
  cta?: string;
}) {
  const [form, setForm] = useState<LeadForm | null>(initial ?? null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initial) return;
    fetch(`${apiBase}/api/crm/forms/${formId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setForm)
      .catch(() => setForm(null));
  }, [apiBase, formId, initial]);

  if (!form) return null;
  if (state === "done") return <p className={className} role="status">{message}</p>;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    setFieldErrors({});
    const payload = Object.fromEntries(new FormData(e.currentTarget));
    payload._page = window.location.href;
    const ctaName = cta ?? new URLSearchParams(window.location.search).get("cta");
    if (ctaName) payload._cta = ctaName;
    const res = await fetch(`${apiBase}/api/crm/forms/${formId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage(body.message);
      setState("done");
    } else {
      setFieldErrors(body.fieldErrors ?? {});
      setMessage(body.error ?? "Something went wrong");
      setState("error");
    }
  }

  return (
    <form className={className ?? "grid gap-3"} onSubmit={onSubmit} noValidate>
      {form.fields.map((f) => {
        const id = `lf-${formId}-${f.name}`;
        const err = fieldErrors[f.name];
        return (
          <div key={f.name}>
            {f.type !== "checkbox" && (
              <Label htmlFor={id}>
                {f.label}
                {f.required && " *"}
              </Label>
            )}
            {f.type === "textarea" ? (
              <Textarea id={id} name={f.name} required={f.required} aria-invalid={!!err} />
            ) : f.type === "select" ? (
              <Select id={id} name={f.name} required={f.required} aria-invalid={!!err}>
                <option value="">Choose…</option>
                {f.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            ) : f.type === "checkbox" ? (
              <label className="flex items-center gap-2 text-sm">
                <input id={id} type="checkbox" name={f.name} required={f.required} /> {f.label}
              </label>
            ) : (
              <Input id={id} name={f.name} type={f.type} required={f.required} aria-invalid={!!err} />
            )}
            {err && <p className="mt-1 text-xs text-danger">{err}</p>}
          </div>
        );
      })}
      {/* Honeypot: hidden from humans, bots fill it in */}
      <input type="text" name="_hp" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {state === "error" && <p className="text-sm text-danger">{message}</p>}
      <Button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : submitLabel}
      </Button>
    </form>
  );
}
