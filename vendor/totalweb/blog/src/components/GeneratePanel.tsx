"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, LocalTime, Select, Textarea } from "@totalweb/ui";
import { requestArticle } from "../server/actions";
import type { BlogGenerationJob } from "../types";

/** Asks ConGenEng for an SEO article. Finished articles land in the review queue, never live. */
export function GeneratePanel({ jobs, reviewHref }: { jobs: BlogGenerationJob[]; reviewHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Poll while a job is running; the engine callback (or the status sync in listJobs) writes the draft.
  const running = jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [running, router]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card>
        <form
          className="grid gap-4"
          action={(fd) =>
            start(async () => {
              setError(null);
              try {
                await requestArticle({
                  topic: String(fd.get("topic") ?? ""),
                  focusKeyword: String(fd.get("focusKeyword") ?? "") || undefined,
                  audience: String(fd.get("audience") ?? "") || undefined,
                  tone: String(fd.get("tone") ?? "") || undefined,
                  lengthWords: Number(fd.get("lengthWords") ?? 1500),
                  notes: String(fd.get("notes") ?? "") || undefined,
                });
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              }
            })
          }
        >
          <div>
            <Label htmlFor="topic">Topic or working title</Label>
            <Input id="topic" name="topic" required minLength={5} placeholder="e.g. How to choose a pour-over grinder" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="focusKeyword">Focus keyword (optional)</Label>
              <Input id="focusKeyword" name="focusKeyword" placeholder="Leave empty to let the AI research one" />
            </div>
            <div>
              <Label htmlFor="lengthWords">Length</Label>
              <Select id="lengthWords" name="lengthWords" defaultValue="1500">
                <option value="800">Short (~800 words)</option>
                <option value="1500">Standard (~1,500 words)</option>
                <option value="2500">Long-form (~2,500 words)</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="audience">Audience (optional)</Label>
              <Input id="audience" name="audience" placeholder="Defaults to the brand profile" />
            </div>
            <div>
              <Label htmlFor="tone">Tone (optional)</Label>
              <Input id="tone" name="tone" placeholder="Defaults to the default voice profile" />
            </div>
          </div>
          <div>
            <Label htmlFor="notes">Must cover / avoid (optional)</Label>
            <Textarea id="notes" name="notes" placeholder="Points to include, products to mention, claims to avoid…" />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Write draft"}
            </Button>
            <p className="text-xs text-muted">Drafts go to the review queue. Nothing is published without a person approving it.</p>
          </div>
        </form>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted">Recent requests</h2>
        <div className="grid gap-2">
          {jobs.length === 0 && <p className="text-sm text-muted">No articles requested yet.</p>}
          {jobs.map((j) => (
            <Card key={j.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{j.request.topic}</p>
                <Badge tone={j.status === "failed" ? "danger" : j.status === "succeeded" ? "success" : "warning"}>{j.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted">
                <LocalTime value={j.created_at} />
                {j.stage && j.status !== "succeeded" ? ` · ${j.stage}` : ""}
                {typeof j.progress === "number" && j.status === "running" ? ` · ${Math.round(j.progress * 100)}%` : ""}
              </p>
              {j.error && <p className="mt-1 text-xs text-danger">{j.error}</p>}
              {j.status === "succeeded" && (
                <a href={reviewHref} className="mt-1 inline-block text-xs text-primary underline">
                  Review draft →
                </a>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
