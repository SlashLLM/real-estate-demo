"use client";

import * as React from "react";

const subscribe = () => () => {};

/**
 * False on the server and during hydration, true once the page runs in the browser. Output that depends on the
 * viewer's timezone or locale (dates, "is it overdue", currency formats) must be the same on both sides of hydration,
 * so render it from this: a stable fallback first, the viewer's version right after. (suppressHydrationWarning would
 * silence the error but keep the server's text, i.e. the server's timezone.)
 */
export function useHydrated() {
  return React.useSyncExternalStore(subscribe, () => true, () => false);
}

/** Before hydration everything formats as en-US in UTC, which the server and the browser agree on. */
const STABLE = { locale: "en-US", timeZone: "UTC" } as const;

export const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/** Which of toLocaleString / toLocaleDateString / toLocaleTimeString to mirror. */
export type TimeKind = "datetime" | "date" | "time";

export function formatDateTime(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions | undefined = DATE_TIME,
  hydrated = true,
  kind: TimeKind = "datetime",
) {
  const d = new Date(value);
  const locale = hydrated ? undefined : STABLE.locale;
  const opts = hydrated ? options : { ...options, timeZone: STABLE.timeZone };
  if (kind === "date") return d.toLocaleDateString(locale, opts);
  if (kind === "time") return d.toLocaleTimeString(locale, opts);
  return d.toLocaleString(locale, opts);
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions, hydrated = true) {
  return Number(value).toLocaleString(hydrated ? undefined : STABLE.locale, options);
}

/** A date/time in the viewer's locale and timezone, hydration-safe. `options` as for toLocaleString. */
export function LocalTime({
  value,
  options = DATE_TIME,
  kind = "datetime",
  fallback = "—",
  className,
}: {
  value: string | number | Date | null | undefined;
  /** Pass `{}` for the browser's default format (like a bare toLocaleString()). */
  options?: Intl.DateTimeFormatOptions;
  kind?: TimeKind;
  fallback?: React.ReactNode;
  className?: string;
}) {
  const hydrated = useHydrated();
  if (value == null || value === "") return <>{fallback}</>;
  const d = new Date(value);
  return (
    <time dateTime={d.toISOString()} className={className}>
      {formatDateTime(d, options, hydrated, kind)}
    </time>
  );
}

/** A number (e.g. currency) in the viewer's locale, hydration-safe. */
export function LocalNumber({ value, options }: { value: number; options?: Intl.NumberFormatOptions }) {
  const hydrated = useHydrated();
  return <>{formatNumber(value, options, hydrated)}</>;
}
