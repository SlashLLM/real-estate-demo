"use client";

import { useState } from "react";
import { PLATFORMS, type PlatformKey } from "../core/platforms.ts";
import type { MediaAsset } from "../types";

/** Roughly how much caption each platform shows before its "…more" (characters). Absent: shown in full. */
const FOLD_AT: Partial<Record<PlatformKey, number>> = {
  instagram: 125,
  tiktok: 90,
  youtube: 110,
  facebook: 480,
  linkedin: 210,
  pinterest: 100,
};

/** Cuts at the last word boundary before `limit`. */
function foldText(text: string, limit: number) {
  if ([...text].length <= limit) return null;
  const cut = [...text].slice(0, limit).join("");
  const at = cut.lastIndexOf(" ");
  return (at > limit * 0.6 ? cut.slice(0, at) : cut).trimEnd();
}

/**
 * Approximate in-feed preview of a post for the selected platform.
 * `fold`: collapse long captions where the platform would, with a working "…more" (off in the composer so the
 * whole text stays visible while typing).
 */
export function LiveDevicePreview({
  platform,
  text,
  title,
  media,
  accountName,
  avatarUrl,
  fold = false,
  showCount = true,
}: {
  platform: PlatformKey;
  text: string;
  title?: string | null;
  media: MediaAsset[];
  accountName: string;
  avatarUrl?: string | null;
  fold?: boolean;
  showCount?: boolean;
}) {
  const cfg = PLATFORMS[platform];
  const [expanded, setExpanded] = useState(false);
  const [videoRatio, setVideoRatio] = useState<number | null>(null);
  const vertical = platform === "tiktok" || (platform === "instagram" && media[0]?.kind === "video");
  const wide = platform === "youtube" && media[0]?.kind === "video";
  const over = [...text].length > cfg.charLimit;
  const first = media[0];
  const short = fold && !expanded && FOLD_AT[platform] ? foldText(text, FOLD_AT[platform]!) : null;
  const captionFirst = platform === "instagram" || platform === "tiktok";

  const caption = (prefix?: string) => (
    <p className="whitespace-pre-wrap break-words text-xs">
      {prefix && <span className="font-semibold">{prefix} </span>}
      {short ?? (text || <span className="text-muted">Your post…</span>)}
      {short && (
        <>
          …{" "}
          <button type="button" className="font-medium text-muted hover:text-fg" onClick={() => setExpanded(true)}>
            more
          </button>
        </>
      )}
      {fold && expanded && FOLD_AT[platform] && foldText(text, FOLD_AT[platform]!) && (
        <>
          {" "}
          <button type="button" className="font-medium text-muted hover:text-fg" onClick={() => setExpanded(false)}>
            less
          </button>
        </>
      )}
    </p>
  );

  // Videos keep their real shape (a vertical reel shows as a Short, not cropped into 16:9).
  const ratio = first?.kind === "video" && videoRatio ? `${Math.min(16 / 9, Math.max(9 / 16, videoRatio))}` : undefined;
  const mediaBlock = first && (
    <div
      className={ratio ? "bg-black" : vertical ? "aspect-[9/16] bg-black" : wide ? "aspect-video bg-black" : "aspect-square bg-black"}
      style={ratio ? { aspectRatio: ratio } : undefined}
    >
      {first.kind === "video" ? (
        <video
          src={first.url ?? undefined}
          className="h-full w-full object-contain"
          muted
          autoPlay
          loop
          playsInline
          controls
          preload="metadata"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight) setVideoRatio(v.videoWidth / v.videoHeight);
          }}
        />
      ) : (
        <img src={first.url ?? undefined} alt="" className="h-full w-full object-cover" />
      )}
    </div>
  );

  const header = (
    <div className="flex items-center gap-2 p-2">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
      ) : (
        <span className="h-7 w-7 rounded-full" style={{ background: cfg.color }} />
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold">{accountName}</p>
        <p className="text-[10px] text-muted">{cfg.name} · now</p>
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[28px] border-4 border-fg/80 bg-surface p-2 shadow-lg">
      <div className="overflow-hidden rounded-[20px] border border-border bg-bg">
        {platform === "youtube" ? (
          // YouTube: the video leads, then title, channel and the (collapsed) description.
          <>
            {mediaBlock}
            {title && <p className="px-2 pt-2 text-sm font-semibold leading-snug">{title}</p>}
            {header}
            <div className="mx-2 mb-2 rounded-lg bg-surface-2 p-2">{caption()}</div>
          </>
        ) : (
          <>
            {header}
            {title && cfg.hasTitle && <p className="px-2 pb-1 text-sm font-semibold">{title}</p>}
            {!captionFirst && <div className="px-2 pb-2">{caption()}</div>}
            {mediaBlock}
            {captionFirst && <div className="p-2">{caption(accountName)}</div>}
          </>
        )}
        {media.length > 1 && <p className="px-2 pb-2 text-[10px] text-muted">+{media.length - 1} more</p>}
      </div>
      {showCount && (
        <p className={`mt-2 text-center text-xs ${over ? "text-danger" : "text-muted"}`}>
          {[...text].length}/{cfg.charLimit}
        </p>
      )}
    </div>
  );
}
