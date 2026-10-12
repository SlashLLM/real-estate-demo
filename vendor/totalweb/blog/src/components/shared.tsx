import { Badge } from "@totalweb/ui";
import { STATUS_LABEL, type PostStatus } from "../core/status.ts";

const TONE: Record<PostStatus, "neutral" | "primary" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  in_review: "warning",
  scheduled: "primary",
  published: "success",
  archived: "neutral",
};

export function PostStatusBadge({ status }: { status: PostStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
