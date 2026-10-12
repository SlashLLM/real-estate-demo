"use client";

import { useRef, useState } from "react";
import { Button } from "@totalweb/ui";
import type { MediaAsset } from "../types";

/** Reads dimensions/duration client-side so the server can validate aspect ratios later. */
async function probe(file: File): Promise<{ width?: number; height?: number; duration?: number }> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight };
    }
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    await new Promise((r, j) => ((v.onloadedmetadata = r), (v.onerror = j)));
    return { width: v.videoWidth, height: v.videoHeight, duration: v.duration };
  } catch {
    return {};
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function MediaPicker({
  library,
  selected,
  onChange,
  apiBase = "/api/social",
}: {
  library: MediaAsset[];
  selected: string[];
  onChange: (ids: string[], added?: MediaAsset) => void;
  apiBase?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState(library);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      let ids = [...selected];
      for (const file of Array.from(files)) {
        const meta = await probe(file);
        const fd = new FormData();
        fd.append("file", file);
        if (meta.width) fd.append("width", String(meta.width));
        if (meta.height) fd.append("height", String(meta.height));
        if (meta.duration) fd.append("duration", String(meta.duration));
        const res = await fetch(`${apiBase}/media`, { method: "POST", body: fd });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Upload failed");
        const asset = { ...body, url: URL.createObjectURL(file) } as MediaAsset;
        setItems((prev) => [asset, ...prev]);
        ids = [...ids, asset.id];
        onChange(ids, asset);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={uploading} onClick={() => input.current?.click()}>
          {uploading ? "Uploading…" : "Upload media"}
        </Button>
        <span className="text-xs text-muted">{selected.length} selected</span>
        <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      {items.length > 0 && (
        <div className="mt-2 grid max-h-48 grid-cols-5 gap-2 overflow-y-auto">
          {items.map((m) => {
            const idx = selected.indexOf(m.id);
            return (
              <button
                type="button"
                key={m.id}
                onClick={() => toggle(m.id)}
                className={`relative aspect-square overflow-hidden rounded-ui border-2 ${idx >= 0 ? "border-primary" : "border-transparent"}`}
                aria-pressed={idx >= 0}
              >
                {m.kind === "video" ? (
                  // A frame 1 s in: films fade in from black, so frame 0 is an empty square.
                  <video src={m.url ? `${m.url}#t=1` : undefined} className="h-full w-full bg-surface-2 object-cover" muted playsInline preload="metadata" />
                ) : (
                  <img src={m.url ?? undefined} alt="" className="h-full w-full object-cover" />
                )}
                {idx >= 0 && (
                  <span className="absolute right-1 top-1 rounded-full bg-primary px-1.5 text-xs text-primary-fg">{idx + 1}</span>
                )}
                {m.kind === "video" && <span className="absolute bottom-1 left-1 text-xs text-white drop-shadow">▶</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
