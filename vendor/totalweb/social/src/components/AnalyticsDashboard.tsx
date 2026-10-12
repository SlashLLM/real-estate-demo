import { Card, Stat } from "@totalweb/ui";
import { PLATFORMS, type PlatformKey } from "../core/platforms.ts";
import { fmt, PlatformChip } from "./shared";

type Analytics = {
  totals: { posts: number; reach: number; engagement: number; followerGrowth: number };
  byPlatform: Record<string, { posts: number; reach: number; engagement: number }>;
  avgEngagementByDayHour: number[][];
  topPosts: any[];
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AnalyticsDashboard({ data, days }: { data: Analytics; days: number }) {
  const rate = data.totals.reach ? (data.totals.engagement / data.totals.reach) * 100 : null;
  const platforms = Object.entries(data.byPlatform).sort((a, b) => b[1].engagement - a[1].engagement);
  const maxEng = Math.max(1, ...platforms.map(([, v]) => v.engagement));
  const maxCell = Math.max(0.0001, ...data.avgEngagementByDayHour.flat());

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Posts (${days}d)`} value={data.totals.posts} />
        <Stat label="Reach" value={fmt(data.totals.reach)} />
        <Stat label="Engagements" value={fmt(data.totals.engagement)} hint={rate == null ? undefined : `${rate.toFixed(1)}% engagement rate`} />
        <Stat label="Follower growth" value={`${data.totals.followerGrowth >= 0 ? "+" : ""}${fmt(data.totals.followerGrowth)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-medium">Engagement by platform</h2>
          {platforms.length === 0 && <p className="text-sm text-muted">No published posts with metrics yet.</p>}
          <ul className="space-y-2">
            {platforms.map(([p, v]) => (
              <li key={p} className="text-sm">
                <div className="flex items-center justify-between">
                  <PlatformChip platform={p as PlatformKey} />
                  <span className="tabular-nums text-muted">
                    {fmt(v.engagement)} eng · {fmt(v.reach)} reach · {v.posts} posts
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-2">
                  <div className="h-2 rounded-full" style={{ width: `${(v.engagement / maxEng) * 100}%`, background: PLATFORMS[p as PlatformKey].color }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-1 font-medium">Best times to post</h2>
          <p className="mb-3 text-xs text-muted">Average engagement per post by weekday and hour (your local time)</p>
          <div className="overflow-x-auto">
            <table className="text-[10px]" role="grid" aria-label="Average engagement heatmap">
              <tbody>
                {data.avgEngagementByDayHour.map((row, d) => (
                  <tr key={d}>
                    <th className="pr-1 text-right font-normal text-muted">{DAYS[d]}</th>
                    {row.map((v, h) => (
                      <td key={h} title={`${DAYS[d]} ${h}:00 · ${v.toFixed(1)}`} className="p-px">
                        <div className="h-3.5 w-3.5 rounded-sm bg-primary" style={{ opacity: v ? 0.12 + 0.88 * (v / maxCell) : 0.05 }} />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th />
                  {Array.from({ length: 24 }, (_, h) => (
                    <td key={h} className="text-center text-muted">
                      {h % 6 === 0 ? h : ""}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-medium">Top posts</h2>
        <ol className="divide-y divide-border">
          {data.topPosts.map((p) => (
            <li key={p.target_id} className="flex items-start gap-3 py-2 text-sm">
              <PlatformChip platform={p.platform} />
              <p className="line-clamp-2 flex-1">{p.content || p.title}</p>
              <span className="whitespace-nowrap tabular-nums text-muted">
                ♥ {fmt(p.likes)} · 💬 {fmt(p.comments)} · ↗ {fmt(p.shares)}
              </span>
              {p.external_url && (
                <a href={p.external_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                  open
                </a>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
