"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, EmptyState, Input, LocalTime, Modal, Select, Table } from "@totalweb/ui";
import { ContactForm } from "./ContactForm";
import { contactName, LIFECYCLE_STAGES, type Company, type Contact } from "../types";

export function ContactsTable({
  contacts,
  companies,
  basePath = "/crm",
}: {
  contacts: Contact[];
  companies: Pick<Company, "id" | "name">[];
  basePath?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search name, email, phone…"
          defaultValue={params.get("q") ?? ""}
          onKeyDown={(e) => e.key === "Enter" && setParam("q", e.currentTarget.value)}
        />
        <Select className="max-w-44" defaultValue={params.get("stage") ?? ""} onChange={(e) => setParam("stage", e.target.value)}>
          <option value="">All stages</option>
          {LIFECYCLE_STAGES.map((s) => (
            <option key={s} value={s}>
              {s.toUpperCase()}
            </option>
          ))}
        </Select>
        <div className="flex-1" />
        <Button onClick={() => setOpen(true)}>New contact</Button>
      </div>

      {contacts.length === 0 ? (
        <EmptyState title="No contacts yet">Create one, or embed a lead form on your website.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Company</th>
              <th>Stage</th>
              <th>Source</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-surface-2" onClick={() => router.push(`${basePath}/contacts/${c.id}`)}>
                <td className="font-medium">{contactName(c)}</td>
                <td className="text-muted">{c.email}</td>
                <td>{c.company?.name}</td>
                <td>
                  <Badge tone={c.lifecycle_stage === "customer" ? "success" : "primary"}>{c.lifecycle_stage.toUpperCase()}</Badge>
                </td>
                <td className="text-muted">{c.source}</td>
                <td className="text-muted">
                  <LocalTime value={c.last_activity_at} kind="date" options={{}} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New contact">
        <ContactForm companies={companies} onDone={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
