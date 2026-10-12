"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Button, Input, Label, Modal, Select, Textarea } from "@totalweb/ui";
import { PLATFORMS, validateForPlatform } from "../core/platforms.ts";
import { publishNow, savePost } from "../server/actions";
import type { Account, MediaAsset, Post } from "../types";
import { LiveDevicePreview } from "./LiveDevicePreview";
import { MediaPicker } from "./MediaPicker";
import { PostStatusView } from "./PostStatus";
import { PlatformChip } from "./shared";

export interface ComposerInitial {
  id?: string;
  content?: string;
  title?: string | null;
  link?: string | null;
  mediaIds?: string[];
  tags?: string[];
  topic?: string | null;
  scheduledAt?: string | null;
  accountIds?: string[];
  overrides?: Record<string, string>;
  options?: Record<string, Record<string, unknown>>;
  draftId?: string;
}

const toLocalInput = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function PostComposerModal({
  open,
  onClose,
  accounts,
  mediaLibrary,
  initial,
  apiBase,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  mediaLibrary: MediaAsset[];
  initial?: ComposerInitial;
  apiBase?: string;
}) {
  const active = accounts.filter((a) => a.status === "active");
  const [selected, setSelected] = useState<string[]>(initial?.accountIds ?? []);
  const [content, setContent] = useState(initial?.content ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [link, setLink] = useState(initial?.link ?? "");
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [mediaIds, setMediaIds] = useState<string[]>(initial?.mediaIds ?? []);
  const [library, setLibrary] = useState(mediaLibrary);
  const [overrides, setOverrides] = useState<Record<string, string>>(initial?.overrides ?? {});
  const [options, setOptions] = useState<Record<string, Record<string, unknown>>>(initial?.options ?? {});
  const [when, setWhen] = useState<"now" | "later">(initial?.scheduledAt ? "later" : "later");
  const [at, setAt] = useState(toLocalInput(initial?.scheduledAt));
  const [tab, setTab] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // After "Publish now": the outcome per platform replaces the form, instead of closing on a silent queue.
  const [published, setPublished] = useState<Post | null>(null);

  const chosen = active.filter((a) => selected.includes(a.id));
  const media = mediaIds.map((id) => library.find((m) => m.id === id)).filter(Boolean) as MediaAsset[];
  const previewAccount = chosen.find((a) => a.id === tab) ?? chosen[0];

  const issues = useMemo(
    () =>
      chosen.flatMap((a) =>
        validateForPlatform(a.platform, { text: overrides[a.id] ?? content, title, media }).map((i) => ({ ...i, account: a.name })),
      ),
    [chosen, overrides, content, title, media],
  );

  const setOpt = (accountId: string, key: string, value: unknown) =>
    setOptions((o) => ({ ...o, [accountId]: { ...(o[accountId] ?? {}), [key]: value } }));

  function submit(draft: boolean) {
    setError(null);
    start(async () => {
      try {
        const post = await savePost({
          id: initial?.id,
          content,
          title: title || null,
          link: link || null,
          mediaIds,
          tags: initial?.tags ?? [],
          topic: topic || null,
          draft,
          draftId: initial?.draftId,
          scheduledAt: when === "now" ? "now" : new Date(at).toISOString(),
          targets: chosen.map((a) => ({
            accountId: a.id,
            platform: a.platform,
            contentOverride: overrides[a.id] ?? null,
            options: options[a.id] ?? {},
          })),
        });
        if (!draft && when === "now") setPublished(await publishNow(post.id));
        else onClose();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  if (published) {
    return (
      <Modal open={open} onClose={onClose} title="Post status">
        <PostStatusView post={published} />
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? "Edit post" : "Create post"} wide>
      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div>
            <Label>Publish to</Label>
            {active.length === 0 && <p className="text-sm text-muted">Connect an account first.</p>}
            <div className="flex flex-wrap gap-2">
              {active.map((a) => {
                const on = selected.includes(a.id);
                return (
                  <button
                    type="button"
                    key={a.id}
                    aria-pressed={on}
                    onClick={() => setSelected((s) => (on ? s.filter((x) => x !== a.id) : [...s, a.id]))}
                    className={`rounded-full border px-3 py-1 text-xs transition ${on ? "border-primary bg-primary/10" : "border-border opacity-60"}`}
                  >
                    <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: PLATFORMS[a.platform].color }} />
                    {a.name}
                  </button>
                );
              })}
            </div>
          </div>

          {chosen.some((a) => PLATFORMS[a.platform].hasTitle) && (
            <div>
              <Label htmlFor="title">Title (YouTube / Pinterest)</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
            </div>
          )}

          <div>
            <div className="mb-1 flex gap-1 border-b border-border text-xs">
              <button type="button" className={`px-2 py-1 ${tab === null ? "border-b-2 border-primary" : "text-muted"}`} onClick={() => setTab(null)}>
                All platforms
              </button>
              {chosen.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  className={`px-2 py-1 ${tab === a.id ? "border-b-2 border-primary" : "text-muted"}`}
                  onClick={() => setTab(a.id)}
                >
                  {PLATFORMS[a.platform].name}
                  {overrides[a.id] != null && " •"}
                </button>
              ))}
            </div>
            {tab === null ? (
              <Textarea rows={7} value={content} onChange={(e) => setContent(e.target.value)} placeholder="What do you want to share?" />
            ) : (
              <>
                <Textarea
                  rows={7}
                  value={overrides[tab] ?? content}
                  onChange={(e) => setOverrides((o) => ({ ...o, [tab]: e.target.value }))}
                />
                {overrides[tab] != null && (
                  <button
                    type="button"
                    className="mt-1 text-xs text-muted underline"
                    onClick={() => setOverrides(({ [tab]: _, ...rest }) => rest)}
                  >
                    Use shared text
                  </button>
                )}
              </>
            )}
          </div>

          <MediaPicker
            library={library}
            selected={mediaIds}
            apiBase={apiBase}
            onChange={(ids, added) => {
              if (added) setLibrary((l) => [added, ...l.filter((x) => x.id !== added.id)]);
              setMediaIds(ids);
            }}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {chosen.some((a) => PLATFORMS[a.platform].hasDestinationLink || a.platform === "linkedin") && (
              <div>
                <Label htmlFor="link">Link</Label>
                <Input id="link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
              </div>
            )}
            <div>
              <Label htmlFor="topic">Topic (for analytics)</Label>
              <Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. product tips" />
            </div>
          </div>

          {chosen.map((a) => (
            <PlatformOptions key={a.id} account={a} values={options[a.id] ?? {}} set={(k, v) => setOpt(a.id, k, v)} />
          ))}

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>When</Label>
              <Select value={when} onChange={(e) => setWhen(e.target.value as "now" | "later")}>
                <option value="later">Schedule</option>
                <option value="now">Publish now</option>
              </Select>
            </div>
            {when === "later" && <Input type="datetime-local" className="w-56" value={at} onChange={(e) => setAt(e.target.value)} />}
          </div>

          {issues.length > 0 && (
            <ul className="rounded-ui border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              {issues.map((i, n) => (
                <li key={n}>
                  {i.account}: {i.message}
                </li>
              ))}
            </ul>
          )}
          {error && <p className="whitespace-pre-wrap text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => submit(true)} disabled={pending || !chosen.length}>
              Save draft
            </Button>
            <Button type="button" onClick={() => submit(false)} disabled={pending || !chosen.length || issues.length > 0}>
              {pending ? (when === "now" ? "Publishing…" : "Saving…") : when === "now" ? "Publish now" : "Schedule"}
            </Button>
          </div>
        </div>

        <div>
          {previewAccount ? (
            <>
              <div className="mb-2 flex flex-wrap gap-1">
                {chosen.map((a) => (
                  <button type="button" key={a.id} onClick={() => setTab(a.id)}>
                    <PlatformChip platform={a.platform} />
                  </button>
                ))}
              </div>
              <LiveDevicePreview
                platform={previewAccount.platform}
                text={overrides[previewAccount.id] ?? content}
                title={title}
                media={media}
                accountName={previewAccount.name}
                avatarUrl={previewAccount.avatar_url}
              />
            </>
          ) : (
            <p className="text-sm text-muted">Select an account to preview.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function PlatformOptions({
  account,
  values,
  set,
}: {
  account: Account;
  values: Record<string, unknown>;
  set: (k: string, v: unknown) => void;
}) {
  const cfg = PLATFORMS[account.platform];
  const fields: ReactNode[] = [];
  if (cfg.privacyOptions.length > 1) {
    fields.push(
      <label key="privacy" className="text-xs text-muted">
        Privacy
        <Select className="mt-1 h-8" value={(values.privacy as string) ?? cfg.defaultPrivacy} onChange={(e) => set("privacy", e.target.value)}>
          {cfg.privacyOptions.map((p) => (
            <option key={p} value={p}>
              {p.toLowerCase().replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </label>,
    );
  }
  if (cfg.hasCategories) {
    fields.push(
      <label key="cat" className="text-xs text-muted">
        Category
        <Select className="mt-1 h-8" value={(values.categoryId as string) ?? "22"} onChange={(e) => set("categoryId", e.target.value)}>
          {Object.entries(YT_CATEGORIES).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      </label>,
    );
  }
  if (cfg.hasDuetStitch) {
    for (const [key, label] of [
      ["disableComment", "Disable comments"],
      ["disableDuet", "Disable duet"],
      ["disableStitch", "Disable stitch"],
      ["isAigc", "AI-generated content"],
    ] as const) {
      fields.push(
        <label key={key} className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={Boolean(values[key])} onChange={(e) => set(key, e.target.checked)} /> {label}
        </label>,
      );
    }
  }
  if (cfg.hasBoard && account.settings.boards?.length) {
    fields.push(
      <label key="board" className="text-xs text-muted">
        Board
        <Select
          className="mt-1 h-8"
          value={(values.boardId as string) ?? account.settings.default_board_id ?? ""}
          onChange={(e) => set("boardId", e.target.value)}
        >
          {account.settings.boards.map((b: { id: string; name: string }) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </label>,
    );
  }
  if (account.platform === "youtube") {
    fields.push(
      <label key="kids" className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={Boolean(values.madeForKids)} onChange={(e) => set("madeForKids", e.target.checked)} /> Made for kids
      </label>,
    );
  }
  if (!fields.length) return null;
  return (
    <fieldset className="rounded-ui border border-border p-3">
      <legend className="px-1 text-xs font-medium">{account.name} options</legend>
      <div className="grid gap-2 sm:grid-cols-2">{fields}</div>
    </fieldset>
  );
}

const YT_CATEGORIES: Record<string, string> = {
  "1": "Film & Animation",
  "2": "Autos & Vehicles",
  "10": "Music",
  "15": "Pets & Animals",
  "17": "Sports",
  "19": "Travel & Events",
  "20": "Gaming",
  "22": "People & Blogs",
  "23": "Comedy",
  "24": "Entertainment",
  "25": "News & Politics",
  "26": "Howto & Style",
  "27": "Education",
  "28": "Science & Technology",
};
