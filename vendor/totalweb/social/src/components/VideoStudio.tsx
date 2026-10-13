"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, Input, Label, Select, Textarea } from "@totalweb/ui";
import { PLATFORMS, PLATFORM_KEYS, VIDEO_FORMATS, VOICE_LABELS, VOICE_MODES, estimateSeconds, type PlatformKey, type VideoFormat, type VoiceMode } from "../core/index.ts";
import { approveVideo, deleteVideo, requestVideo, retryVideo, saveDemoLogins } from "../server/actions";
import type { Account, MediaAsset, VideoProject } from "../types";
import { PostComposerModal, type ComposerInitial } from "./PostComposerModal";
import { fmtSeconds, fmtUsd } from "./shared";

interface DemoLogin {
  id?: string;
  role: string;
  login_url: string;
  email: string;
  notes?: string;
  has_password?: boolean;
  password?: string;
}

const STATUS: Record<VideoProject["status"], { label: string; tone: "neutral" | "primary" | "success" | "warning" | "danger" }> = {
  proposing: { label: "Researching & proposing", tone: "warning" },
  proposed: { label: "Ready for your review", tone: "primary" },
  building: { label: "Building the film", tone: "warning" },
  done: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

/**
 * The video director, in two steps. 1 · Describe the video: the engine researches the product (signing in to the demo
 * accounts read-only when you add them) and proposes three concepts with scripts, beat sheets and voice samples.
 * 2 · Pick a concept, edit the script, choose a voice, approve: the engine captures the real screens and builds the film.
 */
export function VideoStudio({
  projects,
  demoLogins,
  accounts,
  mediaLibrary,
  hasWebsite,
  initialProjectId,
  apiBase,
  defaultVoice,
}: {
  projects: VideoProject[];
  demoLogins: DemoLogin[];
  accounts: Account[];
  mediaLibrary: MediaAsset[];
  hasWebsite: boolean;
  initialProjectId?: string | null;
  apiBase?: string;
  /** The default voice profile's narrator: pre-selected when approving a proposal. */
  defaultVoice?: string | null;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(initialProjectId ?? projects[0]?.id ?? null);
  const [showForm, setShowForm] = useState(projects.length === 0);
  const busy = projects.some((p) => p.status === "proposing" || p.status === "building");
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [busy, router]);
  const open = projects.find((p) => p.id === openId) ?? null;
  const select = (id: string) => {
    setOpenId(id);
    const u = new URL(window.location.href);
    u.searchParams.set("project", id);
    window.history.replaceState(null, "", u.toString());
  };

  return (
    <div className="space-y-6">
      {!hasWebsite && (
        <Card className="border-warning/50">
          <p className="text-sm">Add the website to the brand profile in the AI studio first: the director researches and films the real site.</p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Make a video</h2>
              <p className="mt-1 text-sm text-muted">The director researches your product, proposes three concepts with a script for you to approve, then films the real screens.</p>
            </div>
            <Button size="sm" variant={showForm ? "ghost" : "primary"} onClick={() => setShowForm((s) => !s)}>
              {showForm ? "Hide" : "New video"}
            </Button>
          </div>
          {showForm && (
            <NewVideoForm
              hasLogins={demoLogins.length > 0}
              disabled={!hasWebsite}
              onCreated={(id) => {
                setShowForm(false);
                select(id);
                router.refresh();
              }}
            />
          )}
        </Card>
        <DemoLogins initial={demoLogins} />
      </div>

      {projects.length === 0 ? (
        <EmptyState title="No videos yet">Describe one above. You review three concepts and the script before anything is built.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <ul className="space-y-2" aria-label="Videos">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => select(p.id)}
                  aria-current={p.id === openId ? "true" : undefined}
                  className={`w-full rounded-ui border p-3 text-left transition ${p.id === openId ? "border-primary bg-primary/5" : "border-border bg-surface hover:border-primary/50"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium">{p.title || p.request?.goal || "Untitled video"}</p>
                    <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {VIDEO_FORMATS[p.request?.format as VideoFormat]?.label ?? "Video"} · {p.request?.aspect} · {p.request?.length_s} s
                    {p.cost?.total_usd ? ` · ${fmtUsd(p.cost.total_usd)}` : ""}
                  </p>
                  {p.live && <Progress live={p.live} compact />}
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0">{open ? <ProjectView key={open.id} project={open} accounts={accounts} mediaLibrary={mediaLibrary} apiBase={apiBase} defaultVoice={defaultVoice} /> : null}</div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------- request form

function NewVideoForm({ hasLogins, disabled, onCreated }: { hasLogins: boolean; disabled: boolean; onCreated: (id: string) => void }) {
  const [format, setFormat] = useState<VideoFormat>("social");
  const [length, setLength] = useState(30);
  const [platforms, setPlatforms] = useState<PlatformKey[]>(["instagram", "tiktok"]);
  const [useLogins, setUseLogins] = useState(hasLogins);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("voiceover");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fmt = VIDEO_FORMATS[format];
  return (
    <form
      className="mt-4 space-y-4"
      action={(fd) =>
        start(async () => {
          setError(null);
          try {
            const id = await requestVideo({
              title: String(fd.get("title") || "") || undefined,
              format,
              aspect: fmt.aspect,
              length_s: length,
              goal: String(fd.get("goal") || "") || undefined,
              focus: String(fd.get("focus") || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              platforms,
              useLogins,
              voiceMode,
            });
            onCreated(id);
          } catch (e) {
            setError((e as Error).message);
          }
        })
      }
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Format</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(VIDEO_FORMATS) as VideoFormat[]).map((k) => (
            <button
              type="button"
              key={k}
              aria-pressed={format === k}
              onClick={() => {
                setFormat(k);
                setLength(VIDEO_FORMATS[k].lengths[1]);
              }}
              className={`rounded-ui border p-3 text-left ${format === k ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
            >
              <p className="text-sm font-medium">
                {VIDEO_FORMATS[k].label} <span className="text-muted">· {VIDEO_FORMATS[k].aspect}</span>
              </p>
              <p className="mt-1 text-xs text-muted">{VIDEO_FORMATS[k].hint}</p>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Voice</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(VOICE_MODES) as VoiceMode[]).map((k) => (
            <button
              type="button"
              key={k}
              aria-pressed={voiceMode === k}
              onClick={() => setVoiceMode(k)}
              className={`rounded-ui border p-3 text-left ${voiceMode === k ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
            >
              <p className="text-sm font-medium">{VOICE_MODES[k].label}</p>
              <p className="mt-1 text-xs text-muted">{VOICE_MODES[k].hint}</p>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <label className="text-sm">
          Length
          <Select className="mt-1" value={length} onChange={(e) => setLength(Number(e.target.value))}>
            {fmt.lengths.map((s) => (
              <option key={s} value={s}>
                {s} seconds
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          Title (optional)
          <Input className="mt-1" name="title" placeholder="e.g. Autumn launch demo" />
        </label>
      </div>
      <div>
        <Label htmlFor="goal">What should the video achieve?</Label>
        <Textarea id="goal" name="goal" rows={3} placeholder="e.g. Show customers how fast they get three real quotes, and get them to post their first job" />
      </div>
      <div>
        <Label htmlFor="focus">Features to feature (comma separated, optional)</Label>
        <Input id="focus" name="focus" placeholder="e.g. post a job, compare quotes, negotiation, booking" />
      </div>
      {format !== "demo" && (
        <div>
          <p className="text-sm">For</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {PLATFORM_KEYS.map((p) => {
              const on = platforms.includes(p);
              return (
                <button
                  type="button"
                  key={p}
                  aria-pressed={on}
                  onClick={() => setPlatforms((s) => (on ? s.filter((x) => x !== p) : [...s, p]))}
                  className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary/10" : "border-border opacity-60"}`}
                >
                  {PLATFORMS[p].name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <label className={`flex items-center gap-2 text-sm ${hasLogins ? "" : "opacity-60"}`}>
        <input type="checkbox" checked={useLogins && hasLogins} disabled={!hasLogins} onChange={(e) => setUseLogins(e.target.checked)} />
        Film the logged-in app with the demo logins {hasLogins ? "(read-only: every save is blocked)" : "(add demo logins to enable)"}
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted">Research and proposal take about 3–6 minutes.</span>
        <Button type="submit" disabled={pending || disabled}>
          {pending ? "Starting…" : "Research & propose"}
        </Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------------------------------- demo logins

function DemoLogins({ initial }: { initial: DemoLogin[] }) {
  const [rows, setRows] = useState<DemoLogin[]>(initial);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const set = (i: number, patch: Partial<DemoLogin>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Demo logins</h2>
        <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>
          {editing ? "Close" : rows.length ? "Edit" : "Add"}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Optional. Seeded demo accounts let the director film the logged-in app (dashboards, flows). Capture is read-only: every
        write request is blocked. Passwords are encrypted and never shown again.
      </p>
      {!editing ? (
        <ul className="mt-3 space-y-1 text-sm">
          {rows.length === 0 && <li className="text-muted">None: public pages only.</li>}
          {rows.map((r) => (
            <li key={r.id ?? r.email} className="flex justify-between gap-2">
              <span className="font-medium">{r.role}</span>
              <span className="truncate text-muted">{r.email}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 space-y-3">
          {rows.map((r, i) => (
            <div key={r.id ?? i} className="grid gap-2 rounded-ui border border-border p-2">
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label="Role" placeholder="Role (e.g. customer)" value={r.role} onChange={(e) => set(i, { role: e.target.value })} />
                <Input aria-label="Login URL" placeholder="/login" value={r.login_url} onChange={(e) => set(i, { login_url: e.target.value })} />
              </div>
              <Input aria-label="Email" placeholder="email" value={r.email} onChange={(e) => set(i, { email: e.target.value })} />
              <Input aria-label="Password" type="password" placeholder={r.has_password ? "•••••••• (saved; type to change)" : "password"} value={r.password ?? ""} onChange={(e) => set(i, { password: e.target.value })} />
              <button type="button" className="justify-self-end text-xs text-danger" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
          <div className="flex justify-between">
            <Button size="sm" variant="ghost" onClick={() => setRows((r) => [...r, { role: "", login_url: "/login", email: "" }])}>
              + Add login
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setMsg(null);
                  try {
                    await saveDemoLogins(rows.map(({ has_password, ...r }) => r) as any);
                    setRows((r) => r.map((x) => ({ ...x, password: undefined, has_password: x.has_password || !!x.password })));
                    setEditing(false);
                  } catch (e) {
                    setMsg((e as Error).message);
                  }
                })
              }
            >
              Save
            </Button>
          </div>
          {msg && <p className="text-xs text-danger">{msg}</p>}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------- a project

function Progress({ live, compact }: { live: NonNullable<VideoProject["live"]>; compact?: boolean }) {
  const pct = live.progress == null ? null : Math.round(live.progress * 100);
  return (
    <div className={compact ? "mt-2" : ""} aria-live="polite">
      {!compact && (
        <div className="flex justify-between text-sm">
          <span>{live.stage ? live.stage.charAt(0).toUpperCase() + live.stage.slice(1) : "Starting…"}</span>
          <span className="tabular-nums text-muted">
            {pct != null && `${pct}%`}
            {live.cost_usd != null && ` · ${fmtUsd(live.cost_usd)} so far`}
          </span>
        </div>
      )}
      <div className={`${compact ? "" : "mt-2"} h-1.5 overflow-hidden rounded-full bg-surface-2`} role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full bg-primary transition-[width] duration-700 ${pct == null ? "w-1/3 animate-pulse" : ""}`} style={pct == null ? undefined : { width: `${Math.max(3, pct)}%` }} />
      </div>
    </div>
  );
}

function ProjectView({ project: p, accounts, mediaLibrary, apiBase, defaultVoice }: { project: VideoProject; accounts: Account[]; mediaLibrary: MediaAsset[]; apiBase?: string; defaultVoice?: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rebuild, setRebuild] = useState(false);
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{p.title || "Untitled video"}</h2>
          <p className="text-sm text-muted">
            {VIDEO_FORMATS[p.request?.format as VideoFormat]?.label} · {p.request?.aspect} · {p.request?.length_s} s
            {p.request?.goal ? ` · ${p.request.goal}` : ""}
          </p>
        </div>
        <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
      </div>

      {(p.status === "proposing" || p.status === "building") && (
        <div className="space-y-2">
          {p.live ? <Progress live={p.live} /> : <p className="text-sm text-muted">Queued…</p>}
          <p className="text-xs text-muted">
            {p.status === "proposing"
              ? "Researching the product and writing three concepts. Usually 3–6 minutes."
              : "Capturing the real screens, recording the voice, directing, rendering and reviewing the cut. Usually 20–60 minutes."}
          </p>
        </div>
      )}

      {p.status === "failed" && (
        <div className="space-y-3">
          <p className="rounded-ui bg-danger/10 p-3 text-sm text-danger">{p.error || "Something went wrong."}</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => retryVideo(p.id))}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteVideo(p.id))}>
              Delete
            </Button>
          </div>
        </div>
      )}

      {p.status === "done" && <FilmView p={p} accounts={accounts} mediaLibrary={mediaLibrary} apiBase={apiBase} onRebuild={() => setRebuild((r) => !r)} rebuild={rebuild} />}

      {p.proposal && (p.status === "proposed" || (p.status === "done" && rebuild) || (p.status === "failed" && p.approval)) && (
        <ProposalReview p={p} pending={pending} defaultVoice={defaultVoice} onApprove={(a) => run(() => approveVideo({ projectId: p.id, ...a }))} />
      )}

      <CostLine p={p} />
      {error && <p className="text-sm text-danger">{error}</p>}
    </Card>
  );
}

function CostLine({ p }: { p: VideoProject }) {
  if (!p.cost?.total_usd && !p.live?.cost_usd) return null;
  return (
    <p className="border-t border-border pt-3 text-xs text-muted">
      Cost: proposal {fmtUsd(p.cost?.proposal_usd ?? null)}
      {p.cost?.build_usd != null && ` · film ${fmtUsd(p.cost.build_usd)}`}
      {p.cost?.total_usd ? (
        <>
          {" "}
          · <span className="font-medium text-fg">total {fmtUsd(p.cost.total_usd)}</span>
        </>
      ) : null}
      {p.result?.seconds != null && ` · built in ${fmtSeconds(p.result.seconds)}`} · OpenAI usage; capture, voice, music and rendering run on your server.
    </p>
  );
}

function FilmView({ p, accounts, mediaLibrary, apiBase, onRebuild, rebuild }: { p: VideoProject; accounts: Account[]; mediaLibrary: MediaAsset[]; apiBase?: string; onRebuild: () => void; rebuild: boolean }) {
  const [composer, setComposer] = useState<ComposerInitial | null>(null);
  const r = p.result ?? {};
  const [w, h] = r.size ?? [1080, 1920];
  const script: string[] = p.approval?.script ?? [];
  const caption = script.length ? `${script[0]}\n\n${script[script.length - 1]}` : p.title ?? "";
  const media = p.media_id ? [...mediaLibrary.filter((m) => m.id === p.media_id), ...(mediaLibrary.some((m) => m.id === p.media_id) ? [] : [{ id: p.media_id, kind: "video", mime: "video/mp4", url: p.video_url, storage_path: "", size_bytes: null, source: "ai_generated" } as MediaAsset])] : [];
  return (
    <div className="space-y-4">
      {p.video_url ? (
        <div className="flex justify-center overflow-hidden rounded-ui bg-black">
          <video src={p.video_url} controls playsInline preload="metadata" className="max-h-[70vh] w-auto max-w-full" style={{ aspectRatio: `${w} / ${h}` }} />
        </div>
      ) : (
        <p className="text-sm text-muted">The film is being imported…</p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Concept</dt>
        <dd>{p.proposal?.treatment?.concepts?.find((c: any) => c.key === p.approval?.concept)?.title ?? p.approval?.concept}</dd>
        <dt className="text-muted">Voice</dt>
        <dd>{r.voice_mode === "text" ? "On-screen text + music" : (VOICE_LABELS[p.approval?.voice] ?? p.approval?.voice)}</dd>
        {r.post_caption && (
          <>
            <dt className="text-muted">Post caption</dt>
            <dd>{r.post_caption}</dd>
          </>
        )}
        <dt className="text-muted">Length</dt>
        <dd>{fmtSeconds(r.duration)}</dd>
        <dt className="text-muted">Quality check</dt>
        <dd>{r.qa_pass ? "Passed" : `Warnings: ${(r.qa_failed ?? []).join(", ")}`}</dd>
        <dt className="text-muted">Real screens</dt>
        <dd>
          {r.capture?.screens ?? 0} captured
          {r.capture?.blocked_writes ? ` · ${r.capture.blocked_writes} write requests blocked` : ""}
          {r.capture?.failed?.length ? ` · ${r.capture.failed.length} capture steps skipped` : ""}
        </dd>
      </dl>
      {r.disclosures?.length > 0 && <Disclosures items={r.disclosures} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onRebuild}>
          {rebuild ? "Hide script" : "Edit script & rebuild"}
        </Button>
        {p.video_url && (
          <a className="inline-flex items-center rounded-ui border border-border px-3 text-sm" href={p.video_url} download>
            Download
          </a>
        )}
        <Button size="sm" disabled={!p.media_id} onClick={() => setComposer({ content: caption, mediaIds: p.media_id ? [p.media_id] : [], draftId: p.draft_id ?? undefined })}>
          Schedule this video
        </Button>
      </div>
      {composer && <PostComposerModal open onClose={() => setComposer(null)} accounts={accounts} mediaLibrary={media} initial={composer} apiBase={apiBase} />}
    </div>
  );
}

function Disclosures({ items }: { items: string[] }) {
  return (
    <div className="rounded-ui border border-warning/40 bg-warning/10 p-3 text-sm">
      <p className="font-medium">Check before publishing: scripted, not from your product</p>
      <ul className="mt-1 list-disc pl-5 text-muted">
        {items.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- the proposal

const VISUAL_LABEL: Record<string, string> = { type: "Type", crop: "Real element", card: "Card", screen: "Full page", hits: "Hits", end: "End card" };

/** A beat's headline as the film shows it: the accent word in the brand colour. */
function Headline({ text, accent }: { text: string; accent?: string | null }) {
  const clean = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const a = clean(accent ?? "");
  return (
    <p className="font-semibold">
      {text.split(/\s+/).map((w, i) => (
        <span key={i} className={a && clean(w) === a ? "text-primary" : ""}>
          {w}{" "}
        </span>
      ))}
    </p>
  );
}

function ProposalReview({ p, pending, defaultVoice, onApprove }: { p: VideoProject; pending: boolean; defaultVoice?: string | null; onApprove: (a: { concept: string; script: string[]; voice: string; captions: boolean }) => void }) {
  const proposal = p.proposal!;
  const t = proposal.treatment;
  const [conceptKey, setConceptKey] = useState<string>(p.approval?.concept ?? t.recommended);
  const concept = t.concepts.find((c: any) => c.key === conceptKey) ?? t.concepts[0];
  const [scripts, setScripts] = useState<Record<string, string[]>>(() => {
    const s: Record<string, string[]> = Object.fromEntries(t.concepts.map((c: any) => [c.key, [...c.script]]));
    if (p.approval?.concept && p.approval.script) s[p.approval.concept] = [...p.approval.script];
    return s;
  });
  const lines = scripts[concept.key] ?? [];
  const sampled = (proposal.voices ?? []).map((v: any) => v.voice as string);
  const [voice, setVoice] = useState<string>(
    p.approval?.voice ?? (defaultVoice && sampled.includes(defaultVoice) ? defaultVoice : sampled[0]) ?? defaultVoice ?? "af_heart",
  );
  const [captions, setCaptions] = useState<boolean>(p.approval?.captions ?? VIDEO_FORMATS[(p.request?.format as VideoFormat) ?? "social"]?.captions ?? true);
  const mode: VoiceMode = (p.request?.voice_mode ?? proposal.voice_mode ?? "voiceover") as VoiceMode;
  const est = useMemo(() => estimateSeconds(lines, mode), [lines, mode]);
  const creative = proposal.creative;
  const target = p.request?.length_s ?? proposal.length_s;
  const setLine = (i: number, v: string) => setScripts((s) => ({ ...s, [concept.key]: lines.map((l, j) => (j === i ? v : l)) }));
  const checks = (proposal.checks ?? []).filter((c: any) => c.concept === concept.key);

  return (
    <div className="space-y-6 border-t border-border pt-5">
      <section className="space-y-2 text-sm">
        <h3 className="font-medium">What the director found</h3>
        <p className="text-muted">
          Researched {proposal.research?.pages ?? 0} pages
          {proposal.research?.signed_in_as?.length ? `, signed in as ${proposal.research.signed_in_as.join(", ")}` : ", public pages only"}
          {proposal.research?.blocked_writes ? ` · ${proposal.research.blocked_writes} write requests blocked` : ""}.
        </p>
        {proposal.screens?.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {proposal.screens.map((s: any) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="shrink-0" title={`${s.title ?? ""} ${s.path ?? ""}`}>
                <img src={s.url} alt={s.title ?? s.path ?? "screen"} className="h-24 rounded border border-border object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        )}
        <p>{t.product_summary}</p>
        <p className="text-muted">
          <span className="font-medium text-fg">Story: </span>
          {t.story}
        </p>
        {t.characters?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {t.characters.map((c: any) => (
              <Badge key={c.name} tone={c.real ? "success" : "neutral"}>
                {c.name} · {c.role} · {c.real ? "real record" : "persona"}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-medium">Pick a concept</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {t.concepts.map((c: any) => (
            <button
              type="button"
              key={c.key}
              aria-pressed={c.key === concept.key}
              onClick={() => setConceptKey(c.key)}
              className={`rounded-ui border p-3 text-left text-sm ${c.key === concept.key ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{c.title}</p>
                {c.key === t.recommended && <Badge tone="primary">Recommended</Badge>}
              </div>
              {c.format && (
                <p className="mt-1 text-xs uppercase tracking-wide text-primary">
                  {String(c.format).replace(/_/g, " ")}
                  {c.hook_angle ? ` · ${String(c.hook_angle).replace(/_/g, " ")} hook` : ""}
                </p>
              )}
              <p className="mt-1">{c.central_idea}</p>
              <p className="mt-2 text-xs text-muted">
                <span className="font-medium text-fg">Carries: </span>
                {c.motif}
              </p>
              <p className="mt-1 text-xs text-muted">
                <span className="font-medium text-fg">Opens on: </span>
                {c.hook}
              </p>
            </button>
          ))}
        </div>
        {concept.key === t.recommended && t.recommended_why && <p className="mt-2 text-xs text-muted">Why recommended: {t.recommended_why}</p>}
        {concept.post_caption && (
          <p className="mt-2 text-xs">
            <span className="font-medium">Post caption: </span>
            {concept.post_caption}
          </p>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="font-medium">{mode === "text" ? "On-screen lines" : "Script"}</h3>
          <span className={`text-xs tabular-nums ${Math.abs(est - target) > Math.max(5, target * 0.2) ? "text-warning" : "text-muted"}`}>
            ≈ {est} s {mode === "text" ? "read" : "spoken"} + end card · target {target} s · {lines.join(" ").split(/\s+/).filter(Boolean).length} words
          </span>
        </div>
        <ol className="space-y-2">
          {lines.map((l, i) => {
            const beat = concept.beats?.find((b: any) => b.line === i);
            return (
              <li key={i} className="grid gap-2 md:grid-cols-[1fr_1fr]">
                <div className="flex gap-2">
                  <span className="mt-2 w-5 shrink-0 text-right text-xs tabular-nums text-muted">{i + 1}</span>
                  <Textarea aria-label={`Line ${i + 1}`} rows={2} value={l} onChange={(e) => setLine(i, e.target.value)} />
                </div>
                <div className="rounded-ui bg-surface-2 p-2 text-xs">
                  {beat ? (
                    <>
                      {beat.headline && mode === "voiceover" && <Headline text={beat.headline} accent={beat.accent} />}
                      {beat.visual && (
                        <p className="mt-1">
                          <Badge>{VISUAL_LABEL[beat.visual] ?? beat.visual}</Badge>{" "}
                          {beat.visual === "crop" && beat.target ? `“${beat.target}”` : ""}
                          {beat.visual === "card" && beat.card
                            ? `${beat.card.kind}: ${(beat.card.items ?? []).map((x: any) => [x.label, x.value].filter(Boolean).join(" ")).join(" · ")}`
                            : ""}
                        </p>
                      )}
                      <p className="mt-1">{beat.picture}</p>
                      <p className="mt-1 text-muted">→ {beat.carry}</p>
                    </>
                  ) : (
                    <p className="text-muted">No beat planned for this line yet (the director will stage it).</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="mt-2 flex gap-3 text-xs">
          <button type="button" className="text-primary" onClick={() => setScripts((s) => ({ ...s, [concept.key]: [...lines, ""] }))}>
            + Add line
          </button>
          {lines.length > 1 && (
            <button type="button" className="text-muted" onClick={() => setScripts((s) => ({ ...s, [concept.key]: lines.slice(0, -1) }))}>
              Remove last line
            </button>
          )}
          <button type="button" className="text-muted" onClick={() => setScripts((s) => ({ ...s, [concept.key]: [...concept.script] }))}>
            Reset to proposal
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          {mode === "text"
            ? "Each line is shown on screen as the beat's headline: keep it to one glance (nine words or fewer)."
            : 'Write numbers the way they are said ("forty-nine dollars a month") so the voice reads them naturally.'}
        </p>
      </section>

      {mode === "voiceover" && (
      <section>
        <h3 className="mb-2 font-medium">Voice</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {(proposal.voices ?? []).map((v: any) => (
            <label key={v.voice} className={`flex items-center gap-3 rounded-ui border p-2 text-sm ${voice === v.voice ? "border-primary bg-primary/5" : "border-border"}`}>
              <input type="radio" name="voice" checked={voice === v.voice} onChange={() => setVoice(v.voice)} />
              <span className="w-32 shrink-0">{VOICE_LABELS[v.voice] ?? v.voice}</span>
              <audio src={v.url} controls preload="none" className="h-8 min-w-0 flex-1" />
            </label>
          ))}
        </div>
      </section>
      )}

      {creative && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            How the idea was chosen ({creative.hooks?.length ?? 0} hooks, {(creative.critic ?? []).length} critic notes)
          </summary>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            <ul className="space-y-1 text-xs">
              {(creative.hooks ?? []).slice(0, 8).map((h: any, i: number) => (
                <li key={i} className={(creative.seeds ?? []).includes(h.text) ? "font-medium" : "text-muted"}>
                  <span className="uppercase tracking-wide text-primary">{String(h.angle).replace(/_/g, " ")}</span> · {h.text}
                </li>
              ))}
            </ul>
            <ul className="space-y-1 text-xs text-muted">
              {(creative.critic ?? []).slice(0, 10).map((f: any, i: number) => (
                <li key={i}>
                  <span className={f.severity === "fix" ? "text-warning" : ""}>{f.rule}</span>: {f.detail}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Screens to capture ({concept.capture?.length ?? 0})</summary>
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {(concept.capture ?? []).map((s: any) => (
            <li key={s.name}>
              <span className="font-medium text-fg">{s.name}</span> · {s.url}
              {s.as_role ? ` · as ${s.as_role}` : ""} · {s.viewport} · {s.purpose}
            </li>
          ))}
        </ul>
      </details>

      {(t.disclosures?.length > 0 || checks.length > 0 || t.risks?.length > 0) && (
        <section className="space-y-2">
          {t.disclosures?.length > 0 && <Disclosures items={t.disclosures} />}
          {checks.length > 0 && (
            <ul className="space-y-1 text-xs">
              {checks.map((c: any, i: number) => (
                <li key={i} className={c.level === "error" ? "text-danger" : "text-warning"}>
                  {c.msg}
                </li>
              ))}
            </ul>
          )}
          {t.risks?.length > 0 && <p className="text-xs text-muted">Notes: {t.risks.join(" · ")}</p>}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> Captions
        </label>
        <span className="text-xs text-muted">Building takes about 20–60 minutes.</span>
        <Button disabled={pending || !lines.some((l) => l.trim())} onClick={() => onApprove({ concept: concept.key, script: lines, voice, captions })}>
          {pending ? "Starting…" : p.status === "done" ? "Rebuild with these changes" : "Approve & build"}
        </Button>
      </div>
    </div>
  );
}
