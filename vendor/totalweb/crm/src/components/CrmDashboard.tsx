import { Card, Stat } from "@totalweb/ui";

type Dashboard = {
  stages: { stage_id: string; stage_name: string; kind: string; deal_count: number; total_amount: number; weighted_amount: number }[];
  newContacts30d: number;
  openTasks: number;
  wonAmount30d: number;
  winRate30d: number | null;
  sources: Record<string, number>;
  sourceBreakdown?: { source: string; cta: string | null; page: string | null; count: number }[];
};

/** "/" → "Home", "/how-it-works" → "How it works". */
const pageName = (path: string) =>
  path === "/" ? "Home" : (path.split("/").filter(Boolean).pop() ?? path).replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());

const money = (n: number) => Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function CrmDashboard({ data }: { data: Dashboard }) {
  const open = data.stages.filter((s) => s.kind === "open");
  const pipelineValue = open.reduce((s, x) => s + Number(x.total_amount), 0);
  const weighted = open.reduce((s, x) => s + Number(x.weighted_amount), 0);
  const maxStage = Math.max(1, ...open.map((s) => Number(s.total_amount)));
  const sources =
    data.sourceBreakdown ??
    Object.entries(data.sources)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({ source, cta: null, page: null, count }));
  const maxSource = Math.max(1, ...sources.map((s) => s.count));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open pipeline" value={money(pipelineValue)} hint={`${money(weighted)} weighted`} />
        <Stat label="Won (30 days)" value={money(data.wonAmount30d)} />
        <Stat label="Win rate (30 days)" value={data.winRate30d == null ? "—" : `${Math.round(data.winRate30d * 100)}%`} />
        <Stat label="New contacts (30 days)" value={data.newContacts30d} hint={`${data.openTasks} open tasks`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-medium">Pipeline by stage</h2>
          <ul className="space-y-2">
            {open.map((s) => (
              <li key={s.stage_id} className="text-sm">
                <div className="flex justify-between">
                  <span>
                    {s.stage_name} <span className="text-muted">({s.deal_count})</span>
                  </span>
                  <span className="tabular-nums">{money(s.total_amount)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-2">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${(Number(s.total_amount) / maxStage) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-medium">Lead sources (30 days)</h2>
          {sources.length === 0 && <p className="text-sm text-muted">No new leads.</p>}
          <ul className="space-y-2">
            {sources.map((s) => (
              <li key={`${s.source}|${s.page ?? ""}`} className="text-sm">
                <div className="flex justify-between gap-3">
                  <span className="min-w-0 truncate" title={s.page ? `${s.source} on ${s.page}` : s.source}>
                    {s.page ? (
                      <>
                        <span className="font-medium">{pageName(s.page)} page</span>
                        <span className="text-muted"> · {s.cta ?? s.source}</span>
                      </>
                    ) : (
                      s.source
                    )}
                  </span>
                  <span className="tabular-nums">{s.count}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-2">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${(s.count / maxSource) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
