"use client";

import { useTransition } from "react";
import { Button, EmptyState, LocalTime, Table } from "@totalweb/ui";
import { deletePost, retryPost } from "../server/actions";
import type { Post } from "../types";
import { PlatformChip, StatusBadge } from "./shared";

export function PostHistory({ posts }: { posts: Post[] }) {
  const [pending, start] = useTransition();
  if (!posts.length) return <EmptyState title="Nothing published yet">Scheduled and published posts appear here.</EmptyState>;
  return (
    <Table>
      <thead>
        <tr>
          <th>When</th>
          <th>Post</th>
          <th>Platforms</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {posts.map((p) => (
          <tr key={p.id}>
            <td className="whitespace-nowrap text-muted">
              <LocalTime value={p.scheduled_at} options={{}} />
            </td>
            <td className="max-w-md">
              <p className="line-clamp-2">{p.content || p.title}</p>
              {p.source === "ai" && <span className="text-xs text-primary">AI generated</span>}
            </td>
            <td>
              <div className="flex flex-col gap-1">
                {p.targets.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <PlatformChip platform={t.platform} />
                    <StatusBadge status={t.status} />
                    {t.external_url && (
                      <a className="text-xs text-primary underline" href={t.external_url} target="_blank" rel="noreferrer">
                        view
                      </a>
                    )}
                    {t.error && (
                      <span className="max-w-60 truncate text-xs text-danger" title={t.error}>
                        {t.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </td>
            <td>
              <StatusBadge status={p.status} />
            </td>
            <td className="whitespace-nowrap text-right">
              {p.targets.some((t) => t.status === "failed") && (
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(() => retryPost(p.id))}>
                  Retry
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm("Delete this post?") && start(() => deletePost(p.id))}>
                Delete
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
