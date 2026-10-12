/* Small stroke icon set standing in for SmartHomes' Material Symbols (inline SVG, no icon font to load). */
const paths = {
  home: "M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z",
  chart: "M4 19h16M7 16V11M12 16V7M17 16v-3",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6z",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z",
  shield: "M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z M9 12l2 2 4-4",
  check: "M5 12.5l4.5 4.5L19 7.5",
  star: "M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z",
  calendar: "M5 6h14v14H5z M5 10h14 M9 3v4 M15 3v4",
  pin: "M12 21s-6-5.5-6-10.5a6 6 0 1 1 12 0C18 15.5 12 21 12 21z M12 12.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18",
  phone: "M6 3h3l1.5 4.5-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2L21 15v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z",
  mail: "M4 6h16v12H4z M4 7l8 6 8-6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  trend: "M4 17l6-6 4 4 6-7 M15 8h5v5",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name]} />
    </svg>
  );
}

/** Rounded tinted square holding an icon (SmartHomes' feature-card icon tile). */
export function IconTile({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-highlight text-primary ${className}`}>
      <Icon name={name} className="h-[18px] w-[18px]" />
    </span>
  );
}
