import type { Account, Draft } from "../types";
import type { ComposerInitial } from "./PostComposerModal";

/** Composer pre-filled from a generated draft: copy + hashtags, its media, suggested time, the platform's account. */
export function draftToComposer(d: Draft, accounts: Account[]): ComposerInitial {
  const account = accounts.find((a) => a.platform === d.platform && a.status === "active");
  const hashtags = d.hashtags.length ? `\n\n${d.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}` : "";
  return {
    content: d.content + hashtags,
    title: d.title,
    mediaIds: d.media_ids,
    topic: d.idea?.topic ?? null,
    scheduledAt: d.suggested_at,
    accountIds: account ? [account.id] : [],
    draftId: d.id,
  };
}
