"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@totalweb/ui";
import { PLATFORMS, supportsPostType } from "@totalweb/social/core";
import type { Account, VoiceProfile } from "@totalweb/social";
import { refreshRuns, runNow, saveSchedule } from "../actions";
import { INTERVAL_PRESETS, LIMITS, type AutopilotKind, type AutopilotRun, type AutopilotSchedule, type RunItem } from "../plan";

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

export function AutopilotPanel({
  schedules,
  runs,
  voices,
  accounts,
  voicesHref,
}: {
  schedules: Partial<Record<AutopilotKind, AutopilotSchedule>>;
  runs: Partial<Record<AutopilotKind, AutopilotRun[]>>;
  voices: VoiceProfile[];
  accounts: Account[];
  voicesHref: string;
}) {
  const router = useRouter();
  const running = [...(runs.blog ?? []), ...(runs.social ?? [])].some((r) => r.status === "running");
  // While a run is open, move it on every 20 s (the cron does the same every 5 minutes).
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => refreshRuns().then(() => router.refresh()).catch(() => {}), 20000);
    return () => clearInterval(id);
  }, [running, router]);

  const defaultVoice = voices.find((v) => v.is_default);
  return (
    <div className="grid gap-6">
      <Card className="border-warning text-sm">
        Autopilot publishes without review: articles go live on the blog and posts go out on the chosen accounts on their own.
        Each run asks the AI for its recommended content, written in{" "}
        {defaultVoice ? (
          <>
            the <strong>{defaultVoice.name}</strong> voice
          </>
        ) : (
          "the brand profile's voice"
        )}{" "}
        unless you pick another. <a href={voicesHref} className="text-primary underline">Manage voices →</a>
      </Card>
      <ScheduleCard kind="blog" schedule={schedules.blog} runs={runs.blog ?? []} voices={voices} accounts={accounts} />
      <ScheduleCard kind="social" schedule={schedules.social} runs={runs.social ?? []} voices={voices} accounts={accounts} />
    </div>
  );
}

function ScheduleCard({
  kind,
  schedule: s,
  runs,
  voices,
  accounts,
}: {
  kind: AutopilotKind;
  schedule?: AutopilotSchedule;
  runs: AutopilotRun[];
  voices: VoiceProfile[];
  accounts: Account[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const c = s?.config ?? {};

  const [enabled, setEnabled] = useState(s?.enabled ?? false);
  const preset = INTERVAL_PRESETS.some((p) => p.hours === (s?.interval_hours ?? 24));
  const [intervalChoice, setIntervalChoice] = useState<string>(preset ? String(s?.interval_hours ?? 24) : "custom");
  const [customHours, setCustomHours] = useState<number>(s?.interval_hours ?? 24);
  const [voiceId, setVoiceId] = useState<string>(s?.voice_profile_id ?? "");
  // blog
  const [articles, setArticles] = useState<number>(c.articlesPerRun ?? 1);
  const [lengthWords, setLengthWords] = useState<number>(c.lengthWords ?? 1500);
  const [audience, setAudience] = useState<string>(c.audience ?? "");
  const [notes, setNotes] = useState<string>(c.notes ?? "");
  // social
  const usable = accounts.filter((a) => a.status === "active");
  const [accountIds, setAccountIds] = useState<string[]>(c.accountIds ?? usable.map((a) => a.id));
  const [counts, setCounts] = useState<{ text: number; image: number; video: number }>(c.counts ?? { text: 1, image: 1, video: 0 });
  const [aspect, setAspect] = useState<string>(c.videoSpec?.aspect ?? "9:16");
  const [durationS, setDurationS] = useState<number>(c.videoSpec?.durationS ?? 30);
  const [goals, setGoals] = useState<string>(c.goals ?? "");

  const intervalHours = intervalChoice === "custom" ? customHours : Number(intervalChoice);
  const chosenPlatforms = [...new Set(usable.filter((a) => accountIds.includes(a.id)).map((a) => a.platform))];

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      try {
        const base = { enabled, intervalHours, voiceProfileId: voiceId || null };
        if (kind === "blog")
          await saveSchedule({ ...base, kind, config: { articlesPerRun: articles, lengthWords, audience: audience || undefined, notes: notes || undefined } });
        else
          await saveSchedule({
            ...base,
            kind,
            config: { accountIds, counts, videoSpec: { aspect: aspect as "9:16", durationS }, goals: goals || undefined },
          });
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(zodMessage(e));
      }
    });

  const fire = () =>
    start(async () => {
      setError(null);
      try {
        await runNow(kind);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  const title = kind === "blog" ? "Blog articles" : "Social posts";
  return (
    <Card role="region" aria-label={title}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted">
            {kind === "blog"
              ? "The AI picks the next article the site should rank for, writes it and publishes it, spread over the interval."
              : "The AI plans the posts that should perform best for your accounts and schedules them at its recommended times. Videos use the recommended concept and the voice's narrator."}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" aria-label={`${title} autopilot on`} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {enabled ? "On" : "Off"}
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor={`${kind}-interval`}>Create new content</Label>
          <Select id={`${kind}-interval`} value={intervalChoice} onChange={(e) => setIntervalChoice(e.target.value)}>
            {INTERVAL_PRESETS.map((p) => (
              <option key={p.hours} value={p.hours}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom…</option>
          </Select>
          {intervalChoice === "custom" && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              Every
              <Input type="number" min={LIMITS.minIntervalHours} max={720} value={customHours} onChange={(e) => setCustomHours(Number(e.target.value))} className="w-24" />
              hours
            </div>
          )}
        </div>
        <div>
          <Label htmlFor={`${kind}-voice`}>Voice</Label>
          <Select id={`${kind}-voice`} value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
            <option value="">Default voice{voices.find((v) => v.is_default) ? ` (${voices.find((v) => v.is_default)!.name})` : ""}</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="text-sm">
          <p className="text-muted">Next run</p>
          <p className="font-medium">{s?.enabled ? fmt(s.next_run_at) : "Off"}</p>
          <p className="mt-1 text-xs text-muted">Last run {fmt(s?.last_run_at)}</p>
        </div>
      </div>

      {kind === "blog" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="ap-articles">Articles per run</Label>
            <Input id="ap-articles" type="number" min={1} max={LIMITS.articlesPerRun} value={articles} onChange={(e) => setArticles(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="ap-length">Length</Label>
            <Select id="ap-length" value={lengthWords} onChange={(e) => setLengthWords(Number(e.target.value))}>
              <option value={800}>Short (~800 words)</option>
              <option value={1500}>Standard (~1,500 words)</option>
              <option value={2500}>Long-form (~2,500 words)</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="ap-audience">Audience (optional)</Label>
            <Input id="ap-audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Defaults to the brand profile" />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="ap-notes">Guidance (optional)</Label>
            <Textarea id="ap-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Themes to favour, products to mention, topics or claims to avoid…" />
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          <div>
            <Label>Post to</Label>
            {usable.length === 0 ? (
              <p className="text-sm text-muted">Connect a social account first (Social → Accounts).</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {usable.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 rounded-ui border border-border px-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={accountIds.includes(a.id)}
                      onChange={(e) => setAccountIds((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((i) => i !== a.id)))}
                    />
                    {PLATFORMS[a.platform]?.name ?? a.platform} · {a.username ? `@${a.username}` : a.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {(["text", "image", "video"] as const).map((t) => {
              const where = chosenPlatforms.filter((p) => supportsPostType(p, t));
              return (
                <div key={t}>
                  <Label htmlFor={`ap-${t}`}>{t === "text" ? "Text posts" : t === "image" ? "Image posts" : "Videos"} per run</Label>
                  <Input
                    id={`ap-${t}`}
                    type="number"
                    min={0}
                    max={t === "video" ? LIMITS.videosPerRun : LIMITS.postsPerRun}
                    value={counts[t]}
                    onChange={(e) => setCounts((cs) => ({ ...cs, [t]: Number(e.target.value) }))}
                  />
                  <p className="mt-1 text-xs text-muted">
                    {where.length ? `On ${where.map((p) => PLATFORMS[p]?.name ?? p).join(", ")}` : "None of the chosen accounts takes this type"}
                  </p>
                </div>
              );
            })}
          </div>
          {counts.video > 0 && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="ap-aspect">Video shape</Label>
                <Select id="ap-aspect" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                  <option value="9:16">Vertical 9:16</option>
                  <option value="4:5">Portrait 4:5</option>
                  <option value="1:1">Square 1:1</option>
                  <option value="16:9">Landscape 16:9</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="ap-duration">Video length</Label>
                <Select id="ap-duration" value={durationS} onChange={(e) => setDurationS(Number(e.target.value))}>
                  {[15, 30, 45, 60].map((d) => (
                    <option key={d} value={d}>
                      {d} seconds
                    </option>
                  ))}
                </Select>
              </div>
              <p className="self-end text-xs text-muted">Videos take a while to build and cost more; they run at most every {LIMITS.minVideoIntervalHours} hours.</p>
            </div>
          )}
          <div>
            <Label htmlFor="ap-goals">Goals (optional)</Label>
            <Textarea id="ap-goals" value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="e.g. Drive bookings for the spring offer; mention free delivery" />
          </div>
        </div>
      )}

      {s?.last_error && <p className="mt-3 text-sm text-danger">{s.last_error}</p>}
      {error && <p className="mt-3 whitespace-pre-line text-sm text-danger">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Working…" : "Save"}
        </Button>
        <Button variant="secondary" onClick={fire} disabled={pending || !s?.enabled}>
          Run now
        </Button>
        {saved && <span className="text-sm text-muted">Saved.</span>}
      </div>

      <RunsTable runs={runs} />
    </Card>
  );
}

const RUN_TONE = { running: "warning", done: "success", partial: "warning", failed: "danger" } as const;
const ITEM_TONE = { pending: "neutral", done: "success", failed: "danger", needs_attention: "warning", skipped: "neutral" } as const;

function RunsTable({ runs }: { runs: AutopilotRun[] }) {
  if (!runs.length) return null;
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-sm font-medium text-muted">Recent runs</h3>
      <div className="grid gap-2">
        {runs.map((r) => (
          <details key={r.id} className="rounded-ui border border-border p-3 text-sm">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2">
              <Badge tone={RUN_TONE[r.status]}>{r.status}</Badge>
              <span>{fmt(r.started_at)}</span>
              <span className="text-muted">· {summary(r.items)}</span>
            </summary>
            {r.error && <p className="mt-2 text-danger">{r.error}</p>}
            <ul className="mt-2 grid gap-1">
              {r.items
                .filter((i) => i.kind !== "social_job" || i.state !== "done")
                .map((i) => (
                  <li key={i.ref} className="flex flex-wrap items-center gap-2">
                    <Badge tone={ITEM_TONE[i.state]}>{i.state.replace("_", " ")}</Badge>
                    <span>{i.label ?? i.kind}</span>
                    {i.at && i.state === "done" && <span className="text-muted">· {new Date(i.at) > new Date() ? `goes out ${fmt(i.at)}` : `out ${fmt(i.at)}`}</span>}
                    {i.error && <span className="text-xs text-muted">· {i.error}</span>}
                  </li>
                ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}

function summary(items: RunItem[]) {
  const outputs = items.filter((i) => i.kind !== "social_job");
  const done = outputs.filter((i) => i.state === "done").length;
  const pending = items.some((i) => i.state === "pending");
  const missed = outputs.filter((i) => i.state !== "done" && i.state !== "pending").length;
  return `${done} published${pending ? ", more in progress" : ""}${missed ? `, ${missed} not published` : ""}`;
}

/** zod errors arrive as a JSON list of issues; show their messages. */
function zodMessage(e: unknown) {
  const msg = (e as Error).message;
  try {
    const issues = JSON.parse(msg);
    if (Array.isArray(issues)) return issues.map((i) => i.message).join("\n");
  } catch {}
  return msg;
}
