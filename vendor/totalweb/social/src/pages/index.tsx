/**
 * Full-page server components. Mount each in a host-app route, e.g.
 *   app/social/page.tsx:  export { SocialCalendarPage as default } from "@totalweb/social/pages";
 */
import type { ReactNode } from "react";
import { SocialNav as SocialNavTabs } from "../components/SocialNav";
import {
  AccountsManager,
  AiGeneratePanel,
  AnalyticsDashboard,
  CompetitorsPanel,
  ContentCalendar,
  GeneratedPostsGallery,
  PostHistory,
  VideoStudio,
} from "../components";
import { listDemoAccounts, listVideoProjects } from "../server/video";
import { requireWorkspace } from "@totalweb/supabase/workspace";
import { GENERATED_FILTERS, PLATFORM_KEYS, POST_TYPES, type GeneratedFilter, type PlatformKey, type PostType } from "../core/index.ts";
import {
  configuredPlatforms,
  getAnalytics,
  getGenerationState,
  listAccounts,
  listCompetitors,
  listGeneratedPosts,
  listMedia,
  listPosts,
  listRecentPosts,
} from "../server/queries";
import { API_BASE, UI_BASE } from "../server/env";

type SearchParams = Promise<Record<string, string | undefined>>;

export function SocialNav({ basePath = UI_BASE }: { basePath?: string }) {
  return <SocialNavTabs basePath={basePath} />;
}

function Header({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children && <p className="mt-1 text-sm text-muted">{children}</p>}
    </div>
  );
}

export async function SocialCalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const now = new Date();
  const month = (await searchParams).month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [y, m] = month.split("-").map(Number);
  // Pad the range by a week each side so the 6-week grid shows neighbouring days' posts.
  const from = new Date(y, m - 1, -7).toISOString();
  const to = new Date(y, m, 8).toISOString();
  const [posts, drafts, accounts, media] = await Promise.all([
    listPosts({ from, to }),
    listPosts().then((all) => all.filter((p) => p.status === "draft" && !p.scheduled_at)),
    listAccounts(),
    listMedia(),
  ]);
  return (
    <>
      <Header title="Content calendar" />
      <ContentCalendar month={month} posts={[...posts, ...drafts]} accounts={accounts} mediaLibrary={media} apiBase={API_BASE} />
    </>
  );
}

export async function SocialAiPage() {
  const [state, accounts, media] = await Promise.all([getGenerationState(), listAccounts(), listMedia()]);
  return (
    <>
      <Header title="AI studio">Data-driven post ideas from your history, competitors and trends.</Header>
      <AiGeneratePanel {...state} accounts={accounts} mediaLibrary={media} apiBase={API_BASE} generatedHref={`${UI_BASE}/generated`} videosHref={`${UI_BASE}/videos`} />
    </>
  );
}

/** Every AI-generated post as a preview, filterable by ?status= (not_published|scheduled|published|failed|rejected), ?platform= and ?type=. */
export async function SocialGeneratedPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [{ posts, media }, accounts, library, state] = await Promise.all([listGeneratedPosts(), listAccounts(), listMedia(), getGenerationState()]);
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[]) => (allowed.includes(value as T) ? (value as T) : null);
  return (
    <>
      <Header title="Generated posts">Every post the AI studio drafted, with where it stands on each platform.</Header>
      <GeneratedPostsGallery
        posts={posts}
        media={media}
        accounts={accounts}
        mediaLibrary={library}
        brandName={state.brand?.name ?? state.workspaceName}
        calendarHref={UI_BASE}
        videosHref={`${UI_BASE}/videos`}
        apiBase={API_BASE}
        initialFilters={{
          status: pick<GeneratedFilter>(params.status, GENERATED_FILTERS.map((f) => f.key)),
          platform: pick<PlatformKey>(params.platform, PLATFORM_KEYS),
          type: pick<PostType>(params.type, POST_TYPES.map((t) => t.key)),
        }}
      />
    </>
  );
}

/** The video director: request → three concepts + script to approve → a film of the product's real screens. ?project=<id> opens one. */
export async function SocialVideosPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, workspace] = await Promise.all([searchParams, requireWorkspace()]);
  const [projects, demoLogins, accounts, media, state] = await Promise.all([
    listVideoProjects(workspace.id),
    listDemoAccounts(workspace.id),
    listAccounts(),
    listMedia(),
    getGenerationState(),
  ]);
  return (
    <>
      <Header title="Videos">Product films made from your real screens. You approve the concept and script before anything is built.</Header>
      <VideoStudio
        projects={projects}
        demoLogins={demoLogins}
        accounts={accounts}
        mediaLibrary={media}
        hasWebsite={!!state.brand?.website}
        initialProjectId={params.project ?? null}
        apiBase={API_BASE}
      />
    </>
  );
}

export async function SocialHistoryPage() {
  const posts = await listRecentPosts(100);
  return (
    <>
      <Header title="Post history" />
      <PostHistory posts={posts} />
    </>
  );
}

export async function SocialAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const days = Math.min(365, Math.max(7, Number((await searchParams).days ?? 30)));
  const data = await getAnalytics(days);
  return (
    <>
      <Header title="Analytics">Metrics sync hourly from each platform.</Header>
      <AnalyticsDashboard data={data} days={days} />
    </>
  );
}

export async function SocialCompetitorsPage() {
  const competitors = await listCompetitors();
  return (
    <>
      <Header title="Competitors">Tracked accounts feed into AI content strategy.</Header>
      <CompetitorsPanel competitors={competitors} />
    </>
  );
}

export async function SocialAccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const accounts = await listAccounts();
  return (
    <>
      <Header title="Accounts" />
      <AccountsManager accounts={accounts} configured={configuredPlatforms()} apiBase={API_BASE} notice={{ error: sp.error, connected: sp.connected }} />
    </>
  );
}
