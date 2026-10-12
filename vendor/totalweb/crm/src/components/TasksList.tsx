"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, EmptyState, Input } from "@totalweb/ui";
import { saveTask, setTaskStatus } from "../server/actions";
import { contactName, type Task } from "../types";

export function TaskRow({ task }: { task: Task }) {
  const [pending, start] = useTransition();
  const overdue = task.status === "open" && task.due_at && new Date(task.due_at) < new Date();
  return (
    <label className="flex items-center gap-3 border-b border-border py-2 text-sm last:border-0">
      <input
        type="checkbox"
        checked={task.status === "done"}
        disabled={pending}
        onChange={(e) => start(() => setTaskStatus(task.id, e.target.checked ? "done" : "open"))}
      />
      <span className={task.status === "done" ? "flex-1 text-muted line-through" : "flex-1"}>
        {task.title}
        {task.contact && <span className="ml-2 text-muted">· {contactName(task.contact)}</span>}
      </span>
      {task.due_at && (
        <time className={overdue ? "text-danger" : "text-muted"}>{new Date(task.due_at).toLocaleDateString()}</time>
      )}
    </label>
  );
}

export function TasksList({
  tasks,
  view = "open",
  counts,
}: {
  tasks: Task[];
  view?: "open" | "closed";
  counts?: { open: number; done: number };
}) {
  const [pending, start] = useTransition();
  const pathname = usePathname();
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-full border border-border p-0.5 text-sm" role="tablist" aria-label="Task status">
        {(
          [
            ["open", "Open", counts?.open],
            ["closed", "Closed", counts?.done],
          ] as const
        ).map(([key, label, n]) => (
          <Link
            key={key}
            href={key === "open" ? pathname : `${pathname}?status=closed`}
            role="tab"
            aria-selected={view === key}
            className={`rounded-full px-4 py-1.5 ${view === key ? "bg-primary text-primary-fg" : "text-muted hover:text-fg"}`}
          >
            {label}
            {n != null && <span className="ml-1.5 tabular-nums opacity-80">{n}</span>}
          </Link>
        ))}
      </div>

      {view === "open" && (
        <form
          className="flex gap-2"
          action={(fd) => start(() => saveTask({ title: String(fd.get("title")), due_at: String(fd.get("due_at") || "") }))}
        >
          <Input name="title" placeholder="What needs doing?" required />
          <Input name="due_at" type="date" className="w-40 shrink-0" />
          <Button type="submit" disabled={pending} className="shrink-0 whitespace-nowrap">
            Add task
          </Button>
        </form>
      )}

      {tasks.length === 0 ? (
        <EmptyState title={view === "open" ? "Nothing to do" : "No closed tasks yet"}>
          {view === "closed" && "Tick a task in Open to close it."}
        </EmptyState>
      ) : (
        <div className="rounded-ui border border-border bg-surface px-4">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}
