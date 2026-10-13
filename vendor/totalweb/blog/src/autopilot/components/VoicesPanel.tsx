"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@totalweb/ui";
import { VOICE_LABELS } from "@totalweb/social/core";
import type { VoiceProfile } from "@totalweb/social";
import { deleteVoiceProfile, saveVoiceProfile, setDefaultVoice } from "@totalweb/social/actions";

/** Voice profiles: how the brand writes (blog + social copy) and who narrates its videos. One is the default. */
export function VoicesPanel({ voices }: { voices: VoiceProfile[] }) {
  const [editing, setEditing] = useState<VoiceProfile | "new" | null>(voices.length ? null : "new");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="grid content-start gap-3">
        {voices.length === 0 && <p className="text-sm text-muted">No voices yet. Create one: it becomes the default.</p>}
        {voices.map((v) => (
          <VoiceRow key={v.id} voice={v} onEdit={() => setEditing(v)} />
        ))}
        <div>
          <Button variant="secondary" onClick={() => setEditing("new")}>
            New voice
          </Button>
        </div>
      </div>
      {editing && <VoiceForm key={editing === "new" ? "new" : editing.id} voice={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
    </div>
  );
}

function VoiceRow({ voice: v, onEdit }: { voice: VoiceProfile; onEdit: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            {v.name} {v.is_default && <Badge tone="primary">Default</Badge>}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{v.description}</p>
          <p className="mt-1 text-xs text-muted">Narrator: {VOICE_LABELS[v.narrator_voice] ?? v.narrator_voice}</p>
        </div>
        <div className="flex gap-2">
          {!v.is_default && (
            <Button variant="secondary" disabled={pending} onClick={() => act(() => setDefaultVoice(v.id))}>
              Make default
            </Button>
          )}
          <Button variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => confirm(`Delete the voice "${v.name}"?`) && act(() => deleteVoiceProfile(v.id))}
          >
            Delete
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}

function VoiceForm({ voice, onDone }: { voice: VoiceProfile | null; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <form
        className="grid gap-4"
        action={(fd) =>
          start(async () => {
            setError(null);
            try {
              await saveVoiceProfile({
                id: voice?.id,
                name: String(fd.get("name") ?? ""),
                description: String(fd.get("description") ?? ""),
                examples: String(fd.get("examples") ?? "")
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean),
                narrator_voice: String(fd.get("narrator_voice") ?? "af_heart"),
              });
              router.refresh();
              onDone();
            } catch (e) {
              const msg = (e as Error).message;
              try {
                setError((JSON.parse(msg) as { message: string }[]).map((i) => i.message).join("\n"));
              } catch {
                setError(msg);
              }
            }
          })
        }
      >
        <h2 className="font-semibold">{voice ? `Edit ${voice.name}` : "New voice"}</h2>
        <div>
          <Label htmlFor="v-name">Name</Label>
          <Input id="v-name" name="name" required defaultValue={voice?.name ?? ""} placeholder="e.g. Friendly expert" />
        </div>
        <div>
          <Label htmlFor="v-desc">How it sounds</Label>
          <Textarea
            id="v-desc"
            name="description"
            required
            rows={4}
            defaultValue={voice?.description ?? ""}
            placeholder="Warm and plain-spoken, like a trusted local expert. Short sentences, no jargon, a little dry humour. Never pushy."
          />
        </div>
        <div>
          <Label htmlFor="v-examples">Example lines (optional, one per line)</Label>
          <Textarea
            id="v-examples"
            name="examples"
            rows={4}
            defaultValue={voice?.examples.join("\n") ?? ""}
            placeholder="Lines that sound exactly right: past posts, taglines, how you'd answer a customer."
          />
        </div>
        <div>
          <Label htmlFor="v-narrator">Video narrator</Label>
          <Select id="v-narrator" name="narrator_voice" defaultValue={voice?.narrator_voice ?? "af_heart"}>
            {Object.entries(VOICE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="whitespace-pre-line text-sm text-danger">{error}</p>}
        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save voice"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
