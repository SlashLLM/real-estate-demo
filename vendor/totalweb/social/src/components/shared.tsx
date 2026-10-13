import { Badge, useHydrated } from "@totalweb/ui";
import { PLATFORMS, type PlatformKey } from "../core/platforms.ts";
import type { TargetStatus } from "../types";

export function PlatformChip({ platform, label }: { platform: PlatformKey; label?: string }) {
  const cfg = PLATFORMS[platform];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs">
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: cfg.color }} />
      {label ?? cfg.name}
    </span>
  );
}

const STATUS_TONE: Record<string, "neutral" | "primary" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  pending: "primary",
  scheduled: "primary",
  publishing: "warning",
  processing: "warning",
  published: "success",
  partially_published: "warning",
  failed: "danger",
  cancelled: "neutral",
};

export function StatusBadge({ status }: { status: TargetStatus | string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status.replace("_", " ")}</Badge>;
}

/** "$0.42", "<$0.01", "—". */
export const fmtUsd = (n: number | null | undefined, hydrated = true) =>
  n == null ? "—" : n > 0 && n < 0.01 ? "<$0.01" : n.toLocaleString(hydrated ? undefined : "en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** fmtUsd for client components: en-US until hydrated (matches the server), then the viewer's locale. */
export function Usd({ n }: { n: number | null | undefined }) {
  return <>{fmtUsd(n, useHydrated())}</>;
}

/** "45 s", "3 min 20 s". */
export const fmtSeconds = (s: number | null | undefined) =>
  s == null ? "—" : s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min${s % 60 >= 1 ? ` ${Math.round(s % 60)} s` : ""}`;

export const fmt = (n: number | null | undefined, hydrated = true) =>
  n == null ? "—" : Intl.NumberFormat(hydrated ? undefined : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** fmt for client components (see Usd). */
export function Compact({ n }: { n: number | null | undefined }) {
  return <>{fmt(n, useHydrated())}</>;
}
