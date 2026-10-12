"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label, Select } from "@totalweb/ui";
import { saveContact } from "../server/actions";
import { LIFECYCLE_STAGES, type Company, type Contact } from "../types";

export function ContactForm({
  contact,
  companies,
  onDone,
}: {
  contact?: Partial<Contact>;
  companies: Pick<Company, "id" | "name">[];
  onDone?: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      action={(fd) =>
        start(async () => {
          setError(null);
          try {
            await saveContact({ ...(Object.fromEntries(fd) as Record<string, string>), id: contact?.id } as any);
            onDone?.();
          } catch (e) {
            setError((e as Error).message);
          }
        })
      }
    >
      <div>
        <Label htmlFor="first_name">First name</Label>
        <Input id="first_name" name="first_name" defaultValue={contact?.first_name ?? ""} />
      </div>
      <div>
        <Label htmlFor="last_name">Last name</Label>
        <Input id="last_name" name="last_name" defaultValue={contact?.last_name ?? ""} />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={contact?.email ?? ""} />
      </div>
      <div>
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={contact?.phone ?? ""} />
      </div>
      <div>
        <Label htmlFor="job_title">Job title</Label>
        <Input id="job_title" name="job_title" defaultValue={contact?.job_title ?? ""} />
      </div>
      <div>
        <Label htmlFor="company_name">Company</Label>
        {/* Free text with suggestions: pick an existing company or type a new one (created on save). */}
        <Input
          id="company_name"
          name="company_name"
          list="crm-company-options"
          autoComplete="off"
          placeholder="Type or pick a company"
          defaultValue={companies.find((c) => c.id === contact?.company_id)?.name ?? ""}
        />
        <datalist id="crm-company-options">
          {companies.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </div>
      <div>
        <Label htmlFor="lifecycle_stage">Lifecycle stage</Label>
        <Select id="lifecycle_stage" name="lifecycle_stage" defaultValue={contact?.lifecycle_stage ?? "lead"}>
          {LIFECYCLE_STAGES.map((s) => (
            <option key={s} value={s}>
              {s.toUpperCase()}
            </option>
          ))}
        </Select>
      </div>
      {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : contact?.id ? "Save changes" : "Create contact"}
        </Button>
      </div>
    </form>
  );
}
