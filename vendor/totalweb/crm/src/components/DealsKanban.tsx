"use client";

import { useMemo, useOptimistic, useState, useTransition, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Badge, Button, Input, Label, LocalNumber, Modal, Select } from "@totalweb/ui";
import { moveDeal, saveDeal } from "../server/actions";
import { contactName, type Contact, type Deal, type Stage } from "../types";

/** Hydration-safe: en-US until hydrated (as the server renders it), then the viewer's locale. */
function Money({ n, currency = "USD" }: { n: number; currency?: string }) {
  return <LocalNumber value={Number(n)} options={{ style: "currency", currency, maximumFractionDigits: 0 }} />;
}

/** Position for a card dropped at the end of a column: after the current last card. */
export function nextPosition(deals: Deal[], stageId: string) {
  const inStage = deals.filter((d) => d.stage_id === stageId);
  return inStage.length ? Math.max(...inStage.map((d) => d.position)) + 1 : 1;
}

export function DealsKanban({
  pipelineId,
  stages,
  deals,
  contacts,
}: {
  pipelineId: string;
  stages: Stage[];
  deals: Deal[];
  contacts: Pick<Contact, "id" | "first_name" | "last_name" | "email">[];
}) {
  const [, start] = useTransition();
  const [creating, setCreating] = useState<string | null>(null);
  const [optimistic, applyMove] = useOptimistic(deals, (state, m: { id: string; stage_id: string; position: number }) =>
    state.map((d) => (d.id === m.id ? { ...d, stage_id: m.stage_id, position: m.position } : d)),
  );
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const byStage = useMemo(() => {
    const map = new Map<string, Deal[]>(stages.map((s) => [s.id, []]));
    for (const d of [...optimistic].sort((a, b) => a.position - b.position)) map.get(d.stage_id)?.push(d);
    return map;
  }, [optimistic, stages]);

  function onDragEnd(e: DragEndEvent) {
    const stageId = e.over?.id as string | undefined;
    const id = e.active.id as string;
    const deal = optimistic.find((d) => d.id === id);
    if (!stageId || !deal || deal.stage_id === stageId) return;
    const position = nextPosition(optimistic, stageId);
    start(async () => {
      applyMove({ id, stage_id: stageId, position });
      await moveDeal(id, stageId, position);
    });
  }

  return (
    <>
      {/* A fixed id: dnd-kit otherwise numbers its accessibility ids per page load, which breaks hydration. */}
      <DndContext id="deals-kanban" sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const items = byStage.get(stage.id) ?? [];
            const total = items.reduce((s, d) => s + Number(d.amount), 0);
            return (
              <Column key={stage.id} stage={stage}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{stage.name}</p>
                    <p className="text-xs text-muted tabular-nums">
                      {items.length} · <Money n={total} />
                    </p>
                  </div>
                  {stage.kind === "open" && (
                    <button className="text-muted hover:text-fg" aria-label={`Add deal to ${stage.name}`} onClick={() => setCreating(stage.id)}>
                      +
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {items.map((d) => (
                    <DealCard key={d.id} deal={d} />
                  ))}
                </div>
              </Column>
            );
          })}
        </div>
      </DndContext>

      <Modal open={!!creating} onClose={() => setCreating(null)} title="New deal">
        <form
          className="grid gap-3"
          action={(fd) =>
            start(async () => {
              await saveDeal({
                title: String(fd.get("title")),
                amount: Number(fd.get("amount") || 0),
                currency: String(fd.get("currency") || "USD"),
                contact_id: String(fd.get("contact_id") || ""),
                expected_close: String(fd.get("expected_close") || ""),
                pipeline_id: pipelineId,
                stage_id: creating!,
              });
              setCreating(null);
            })
          }
        >
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required />
          </div>
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" name="amount" type="number" min="0" step="1" />
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" name="currency" defaultValue="USD" maxLength={3} />
            </div>
          </div>
          <div>
            <Label htmlFor="contact_id">Contact</Label>
            <Select id="contact_id" name="contact_id">
              <option value="">—</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {contactName(c)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="expected_close">Expected close</Label>
            <Input id="expected_close" name="expected_close" type="date" />
          </div>
          <div className="flex justify-end">
            <Button type="submit">Create deal</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Column({ stage, children }: { stage: Stage; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section
      ref={setNodeRef}
      aria-label={stage.name}
      className={`min-h-64 w-72 shrink-0 rounded-ui border p-3 transition ${
        isOver ? "border-primary bg-primary/5" : "border-border bg-surface-2"
      }`}
    >
      {children}
    </section>
  );
}

function DealCard({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <article
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-ui border border-border bg-surface p-3 text-sm shadow-sm ${isDragging ? "z-10 opacity-80 shadow-lg" : ""}`}
    >
      <p className="font-medium">{deal.title}</p>
      <p className="mt-1 tabular-nums"><Money n={deal.amount} currency={deal.currency} /></p>
      <div className="mt-2 flex flex-wrap gap-1 text-xs text-muted">
        {deal.contact && <span>{contactName(deal.contact)}</span>}
        {deal.company && <span>· {deal.company.name}</span>}
        {deal.status !== "open" && <Badge tone={deal.status === "won" ? "success" : "danger"}>{deal.status}</Badge>}
      </div>
    </article>
  );
}
