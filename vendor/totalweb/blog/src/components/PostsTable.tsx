import Link from "next/link";
import { Badge, EmptyState, LocalTime, Table } from "@totalweb/ui";
import { seoChecklist } from "../core/seo.ts";
import type { AdminPostRow } from "../server/queries";
import { PostStatusBadge } from "./shared";

/** Admin list of posts with status, SEO score and AI origin. Rows open the editor. */
export function PostsTable({ posts, basePath }: { posts: AdminPostRow[]; basePath: string }) {
  if (!posts.length) {
    return (
      <EmptyState title="No posts here yet">
        Ask the <Link href={`${basePath}/generate`} className="text-primary underline">AI writer</Link> for a draft, or start one yourself.
      </EmptyState>
    );
  }
  return (
    <Table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Status</th>
          <th>SEO</th>
          <th>Keyword</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        {posts.map((p) => {
          const checks = seoChecklist(p);
          const passed = checks.filter((c) => c.ok).length;
          const errors = checks.some((c) => c.level === "error" && !c.ok);
          return (
            <tr key={p.id}>
              <td>
                <Link href={`${basePath}/${p.id}`} className="font-medium hover:underline">
                  {p.title}
                </Link>
                <div className="text-xs text-muted">/blog/{p.slug}</div>
              </td>
              <td className="whitespace-nowrap">
                <PostStatusBadge status={p.status} /> {p.ai_generated && <Badge tone="primary">AI</Badge>}
              </td>
              <td className={`tabular-nums ${errors ? "text-danger" : passed === checks.length ? "text-success" : "text-warning"}`}>
                {passed}/{checks.length}
              </td>
              <td className="text-muted">{p.focus_keyword ?? "—"}</td>
              <td className="whitespace-nowrap text-muted"><LocalTime value={p.status === "scheduled" ? p.published_at : p.updated_at} /></td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
