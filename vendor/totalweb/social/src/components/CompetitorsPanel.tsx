"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, EmptyState, Input } from "@totalweb/ui";
import { deleteCompetitor, refreshCompetitors, saveCompetitor } from "../server/actions";
import type { Competitor } from "../types";

export function CompetitorsPanel({ competitors }: { competitors: Competitor[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex flex-1 flex-wrap gap-2"
          action={(fd) => start(() => saveCompetitor({ name: String(fd.get("name")), website: String(fd.get("website") || "") || undefined }))}
        >
          <Input name="name" placeholder="Competitor name" required className="max-w-56" />
          <Input name="website" placeholder="https://their-site.com" className="max-w-64" />
          <Button type="submit" variant="secondary" disabled={pending}>
            Add
          </Button>
        </form>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              try {
                await refreshCompetitors();
              } catch (e) {
                setError((e as Error).message);
              }
            })
          }
        >
          {pending ? "Researching…" : "Find competitors with AI"}
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      {competitors.length === 0 ? (
        <EmptyState title="No competitors tracked">Add them manually or let the engine research your niche on the web.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {competitors.map((c) => (
            <Card key={c.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{c.name}</p>
                  {c.website && (
                    <a href={c.website} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                      {c.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Badge tone={c.source === "manual" ? "neutral" : "primary"}>{c.source === "manual" ? "manual" : "AI found"}</Badge>
                  <button className="text-xs text-muted hover:text-danger" aria-label={`Remove ${c.name}`} onClick={() => start(() => deleteCompetitor(c.id))}>
                    ✕
                  </button>
                </div>
              </div>
              {c.summary?.why && <p className="text-xs text-muted">{c.summary.why}</p>}
              {Object.keys(c.handles ?? {}).length > 0 && (
                <p className="text-xs">
                  {Object.entries(c.handles).map(([p, h]) => (
                    <span key={p} className="mr-2">
                      {p}: <span className="text-muted">{h}</span>
                    </span>
                  ))}
                </p>
              )}
              {c.summary?.top_topics?.length ? (
                <div className="flex flex-wrap gap-1">
                  {c.summary.top_topics.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              ) : null}
              {c.summary?.posting_frequency && <p className="text-xs text-muted">Posts {c.summary.posting_frequency}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
