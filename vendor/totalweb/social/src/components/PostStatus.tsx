"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Modal } from "@totalweb/ui";
import { getPostStatus, publishNow, retryPost } from "../server/actions";
import type { Post, PostTarget } from "../types";
import { PlatformChip, StatusBadge } from "./shared";

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;

const isDue = (t: PostTarget) => !t.scheduled_at || new Date(t.scheduled_at).getTime() <= Date.now();

/** Plain-language state of one platform target. */
function describe(t: PostTarget): { text: string; tone?: "danger" } {
  switch (t.status) {
    case "published":
      return { text: `Published${t.published_at ? ` ${when(t.published_at)}` : ""}` };
    case "publishing":
      return { text: "Uploading now…" };
    case "processing":
      return { text: "Uploaded. The platform is still processing it." };
    case "failed":
      return { text: t.error ?? "Failed", tone: "danger" };
    case "cancelled":
      return { text: "Not sent (draft)" };
    default:
      if (t.error) return { text: `Last attempt failed, retrying ${when(t.next_attempt_at) ?? "soon"}: ${t.error}`, tone: "danger" };
      return { text: isDue(t) ? "Queued. Waiting for the publisher." : `Scheduled for ${when(t.scheduled_at)}` };
  }
}

/** Nothing has gone out yet, so the post can still be edited and rescheduled. */
export const isEditable = (p: Post) => p.status === "draft" || p.targets.every((t) => t.status === "pending" || t.status === "cancelled");

/**
 * Where a scheduled/published post stands on each platform: queued, uploading, processing, live (with a link), or
 * failed (with the reason), plus the actions that make sense from there. Polls while anything is in flight.
 */
export function PostStatusView({ post: initial, onEdit }: { post: Post; onEdit?: () => void }) {
  const [post, setPost] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Callers may pass a list row without the queue fields; load the full, current state once.
  useEffect(() => {
    getPostStatus(initial.id).then(setPost).catch(() => {});
  }, [initial.id]);

  const inFlight = post.targets.some((t) => t.status === "publishing" || t.status === "processing");
  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => getPostStatus(post.id).then(setPost).catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [inFlight, post.id]);

  const run = (fn: () => Promise<Post>) =>
    start(async () => {
      setError(null);
      try {
        setPost(await fn());
      } catch (e) {
        setError((e as Error).message);
      }
    });

  const queued = post.targets.some((t) => t.status === "pending");
  const failed = post.targets.some((t) => t.status === "failed");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={post.status} />
        {post.title && <span className="font-medium">{post.title}</span>}
      </div>
      <p className="line-clamp-3 whitespace-pre-line text-sm text-muted">{post.content}</p>

      <ul className="divide-y divide-border rounded-ui border border-border">
        {post.targets.map((t) => {
          const d = describe(t);
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <PlatformChip platform={t.platform} />
              <StatusBadge status={t.status} />
              <span className={`min-w-0 flex-1 break-words ${d.tone === "danger" ? "text-danger" : "text-muted"}`}>{d.text}</span>
              {t.external_url && (
                <a href={t.external_url} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                  View live post
                </a>
              )}
            </li>
          );
        })}
      </ul>

      {pending && <p className="text-sm text-muted">Publishing… large videos can take a minute.</p>}
      {error && <p className="whitespace-pre-wrap text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        {onEdit && isEditable(post) && (
          <Button type="button" variant="ghost" disabled={pending} onClick={onEdit}>
            Edit
          </Button>
        )}
        <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => getPostStatus(post.id))}>
          Refresh
        </Button>
        {failed && (
          <Button type="button" disabled={pending} onClick={() => run(async () => (await retryPost(post.id), publishNow(post.id)))}>
            Retry now
          </Button>
        )}
        {queued && !failed && (
          <Button type="button" disabled={pending} onClick={() => run(() => publishNow(post.id))}>
            Publish now
          </Button>
        )}
      </div>
    </div>
  );
}

export function PostStatusModal({ post, onClose, onEdit }: { post: Post; onClose: () => void; onEdit?: () => void }) {
  return (
    <Modal open onClose={onClose} title="Post status">
      <PostStatusView post={post} onEdit={onEdit} />
    </Modal>
  );
}
