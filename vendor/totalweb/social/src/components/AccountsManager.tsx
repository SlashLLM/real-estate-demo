"use client";

import { useTransition } from "react";
import { Badge, Button, Card, Select } from "@totalweb/ui";
import { PLATFORMS, PLATFORM_KEYS, type PlatformKey } from "../core/platforms.ts";
import { disconnectAccount, updateAccountSettings } from "../server/actions";
import type { Account } from "../types";

export function AccountsManager({
  accounts,
  configured,
  apiBase = "/api/social",
  notice,
}: {
  accounts: Account[];
  /** platforms with developer-app credentials set */
  configured: PlatformKey[];
  apiBase?: string;
  notice?: { error?: string; connected?: string };
}) {
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      {notice?.error && <p className="rounded-ui border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{notice.error}</p>}
      {notice?.connected && (
        <p className="rounded-ui border border-success/40 bg-success/10 p-3 text-sm text-success">
          Connected {PLATFORMS[notice.connected as PlatformKey]?.name ?? notice.connected}.
        </p>
      )}

      <section>
        <h2 className="mb-3 font-medium">Connected accounts</h2>
        {accounts.length === 0 && <p className="text-sm text-muted">No accounts connected yet.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {accounts.map((a) => (
            <Card key={a.id} className="flex items-start gap-3">
              {a.avatar_url ? (
                <img src={a.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="h-10 w-10 rounded-full" style={{ background: PLATFORMS[a.platform].color }} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a.name}</p>
                <p className="text-xs text-muted">
                  {PLATFORMS[a.platform].name}
                  {a.username && ` · @${a.username}`}
                </p>
                {a.status !== "active" && (
                  <p className="mt-1 text-xs text-danger">
                    <Badge tone="danger">{a.status}</Badge> {a.last_error}
                  </p>
                )}
                {a.platform === "pinterest" && a.settings.boards?.length > 0 && (
                  <label className="mt-2 block text-xs text-muted">
                    Default board
                    <Select
                      className="mt-1 h-8"
                      defaultValue={a.settings.default_board_id ?? ""}
                      onChange={(e) => start(() => updateAccountSettings(a.id, { default_board_id: e.target.value }))}
                    >
                      {a.settings.boards.map((b: { id: string; name: string }) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {a.status !== "active" && (
                  <a href={`${apiBase}/connect/${a.platform}`}>
                    <Button size="sm">Reconnect</Button>
                  </a>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => confirm(`Disconnect ${a.name}? Scheduled posts to it will be removed.`) && start(() => disconnectAccount(a.id))}
                >
                  Disconnect
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-medium">Connect a platform</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PLATFORM_KEYS.map((key) => {
            const cfg = PLATFORMS[key];
            const ready = configured.includes(key);
            return (
              <Card key={key} className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: cfg.color }} />
                  <p className="font-medium">{cfg.name}</p>
                </div>
                <p className="mt-1 flex-1 text-xs text-muted">{cfg.description}</p>
                {ready ? (
                  <a href={`${apiBase}/connect/${key}`} className="mt-3">
                    <Button size="sm" variant="secondary" className="w-full">
                      Connect
                    </Button>
                  </a>
                ) : (
                  <p className="mt-3 text-xs text-muted">Add app credentials to .env to enable.</p>
                )}
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
