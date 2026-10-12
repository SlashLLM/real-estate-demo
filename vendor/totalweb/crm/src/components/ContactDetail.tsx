"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Badge, Button, Card, Input, Modal, Select, Textarea } from "@totalweb/ui";
import { ContactForm } from "./ContactForm";
import { TaskRow } from "./TasksList";
import { logActivity, saveTask } from "../server/actions";
import { contactName, type Activity, type Company, type Contact, type Deal, type Task } from "../types";

const ACTIVITY_ICON: Record<string, string> = {
  note: "📝",
  call: "📞",
  email: "✉️",
  meeting: "📅",
  form_submission: "🧾",
  social: "💬",
  system: "⚙️",
};

export function ContactDetail({
  contact,
  activities,
  deals,
  tasks,
  companies,
}: {
  contact: Contact;
  activities: Activity[];
  deals: Deal[];
  tasks: Task[];
  companies: Pick<Company, "id" | "name">[];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold">{contactName(contact)}</h1>
              <p className="text-sm text-muted">{contact.job_title}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Email" value={contact.email} />
            <Row label="Phone" value={contact.phone} />
            <Row label="Company" value={contact.company?.name} />
            <Row label="Stage" value={<Badge tone="primary">{contact.lifecycle_stage.toUpperCase()}</Badge>} />
            <Row label="Source" value={contact.source} />
            {Object.entries(contact.custom_fields ?? {}).map(([k, v]) => (
              <Row key={k} label={k} value={String(v)} />
            ))}
          </dl>
        </Card>

        <Card>
          <h2 className="mb-2 font-medium">Deals</h2>
          {deals.length === 0 && <p className="text-sm text-muted">No deals.</p>}
          {deals.map((d) => (
            <div key={d.id} className="flex justify-between py-1 text-sm">
              <span>{d.title}</span>
              <span className="tabular-nums">
                {Number(d.amount).toLocaleString(undefined, { style: "currency", currency: d.currency })}
              </span>
            </div>
          ))}
        </Card>

        <Card>
          <h2 className="mb-2 font-medium">Tasks</h2>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
          <form
            className="mt-2 flex gap-2"
            action={(fd) =>
              start(() => saveTask({ title: String(fd.get("title")), due_at: String(fd.get("due_at") || ""), contact_id: contact.id }))
            }
          >
            <Input name="title" placeholder="New task" required />
            <Input name="due_at" type="date" className="w-36" />
            <Button size="sm" type="submit" disabled={pending}>
              Add
            </Button>
          </form>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <form
            className="space-y-2"
            action={(fd) =>
              start(async () => {
                await logActivity({
                  type: fd.get("type") as "note",
                  subject: String(fd.get("subject") ?? ""),
                  body: String(fd.get("body") ?? ""),
                  contact_id: contact.id,
                });
              })
            }
          >
            <div className="flex gap-2">
              <Select name="type" className="w-36">
                <option value="note">Note</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="meeting">Meeting</option>
              </Select>
              <Input name="subject" placeholder="Subject" />
            </div>
            <Textarea name="body" placeholder="What happened?" />
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                Log activity
              </Button>
            </div>
          </form>
        </Card>

        <ol className="space-y-3">
          {activities.map((a) => (
            <li key={a.id} className="flex gap-3">
              <span aria-hidden className="mt-0.5">
                {ACTIVITY_ICON[a.type]}
              </span>
              <div className="flex-1 rounded-ui border border-border bg-surface p-3">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{a.subject ?? a.type}</span>
                  <time className="text-muted">{new Date(a.occurred_at).toLocaleString()}</time>
                </div>
                {a.body && <p className="mt-1 whitespace-pre-wrap text-sm">{a.body}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit contact">
        <ContactForm contact={contact} companies={companies} onDone={() => setEditing(false)} />
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value || "—"}</dd>
    </div>
  );
}
