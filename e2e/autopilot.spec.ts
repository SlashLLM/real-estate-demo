import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { APP_URL, CRON_SECRET, ENGINE_URL } from "./support/constants";
import { admin, readSeed } from "./support/db";

// Autopilot: a default voice → blog and social schedules → "Run now" → the cron tick publishes what the (stub) engine
// recommends without review: articles live/scheduled across the interval, posts scheduled, and a video whose recommended
// concept is approved with the voice's narrator before it is posted.
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const voice = {
  name: `E2E Voice ${run}`,
  description: `Calm, plain-spoken Singapore property expert ${run}. Short sentences, no hype.`,
  example: "Your flat's value isn't a guess. It's in the numbers.",
  narrator: "bm_george",
};

const card = (page: Page, name: "Blog articles" | "Social posts") => page.getByRole("region", { name });

const tick = async (request: APIRequestContext) => {
  const res = await request.post(`${APP_URL}/api/autopilot/cron`, { headers: { "x-cron-secret": CRON_SECRET } });
  expect(res.status()).toBe(200);
  return res.json();
};

const engineRequests = async (request: APIRequestContext, path: string) =>
  ((await (await request.get(`${ENGINE_URL}/__requests`)).json()) as { path: string; payload: any }[]).filter((r) => r.path === path).map((r) => r.payload);

/** Ticks until the kind's latest run is closed (each tick moves it one step: engine result → publish → video → post). */
async function untilRunCloses(request: APIRequestContext, kind: "blog" | "social") {
  const { workspaceId } = readSeed();
  let status = "running";
  await expect
    .poll(
      async () => {
        await tick(request);
        const { data } = await admin().from("autopilot_runs").select("status").eq("workspace_id", workspaceId).eq("kind", kind).order("started_at", { ascending: false }).limit(1).single();
        status = data?.status ?? "missing";
        return status;
      },
      { timeout: 90_000, intervals: [1_500, 2_000, 3_000] },
    )
    .not.toBe("running");
  return status;
}

// The specs share one workspace: remove everything the autopilot made so later specs see only their own drafts and posts.
test.afterAll(async () => {
  const { workspaceId } = readSeed();
  const db = admin();
  const { data: socialJobs } = await db.from("social_generation_jobs").select("id").eq("workspace_id", workspaceId).not("request->autopilot", "is", null);
  const jobIds = (socialJobs ?? []).map((j) => j.id);
  if (jobIds.length) {
    const { data: drafts } = await db.from("social_generated_drafts").select("id").in("job_id", jobIds);
    const draftIds = (drafts ?? []).map((d) => d.id);
    if (draftIds.length) {
      const { data: videos } = await db.from("social_video_projects").select("media_id").in("draft_id", draftIds);
      const mediaIds = (videos ?? []).map((v) => v.media_id).filter(Boolean);
      await db.from("social_video_projects").delete().in("draft_id", draftIds);
      await db.from("social_posts").delete().in("draft_id", draftIds);
      if (mediaIds.length) await db.from("social_media_assets").delete().in("id", mediaIds);
    }
    await db.from("social_generation_jobs").delete().in("id", jobIds); // drafts cascade
  }
  const { data: blogJobs } = await db.from("blog_generation_jobs").select("id").eq("workspace_id", workspaceId).not("request->autopilot", "is", null);
  const blogJobIds = (blogJobs ?? []).map((j) => j.id);
  if (blogJobIds.length) {
    await db.from("blog_posts").delete().in("job_id", blogJobIds);
    await db.from("blog_generation_jobs").delete().in("id", blogJobIds);
  }
  await db.from("autopilot_schedules").delete().eq("workspace_id", workspaceId); // runs cascade
  await db.from("voice_profiles").delete().eq("workspace_id", workspaceId);
});

test("the cron route refuses calls without the secret", async ({ request }) => {
  expect((await request.post(`${APP_URL}/api/autopilot/cron`)).status()).toBe(401);
  expect((await request.post(`${APP_URL}/api/autopilot/cron`, { headers: { "x-cron-secret": "wrong" } })).status()).toBe(401);
});

test("a new voice profile becomes the default", async ({ page }) => {
  await page.goto("/admin/autopilot/voices");
  await expect(page.getByRole("heading", { name: "Voices" })).toBeVisible();
  if (!(await page.getByLabel("How it sounds").isVisible())) await page.getByRole("button", { name: "New voice" }).click();
  await page.getByLabel("Name").fill(voice.name);
  await page.getByLabel("How it sounds").fill(voice.description);
  await page.getByLabel("Example lines (optional, one per line)").fill(voice.example);
  await page.getByLabel("Video narrator").selectOption(voice.narrator);
  await page.getByRole("button", { name: "Save voice" }).click();

  const row = page.locator("p", { hasText: voice.name }).first(); // the name, with the Default badge beside it
  await expect(row).toBeVisible();
  // The first profile is the default (a profile seeded from the brand voice may already exist: make ours the default).
  if (!(await row.getByText("Default").isVisible())) await page.getByRole("button", { name: "Make default" }).click();
  await expect(row.getByText("Default")).toBeVisible();
  await expect(page.getByText("Narrator: George (UK)").first()).toBeVisible();
});

test("blog autopilot writes the recommended articles in the voice and publishes them across the interval", async ({ page, request }) => {
  const { workspaceId } = readSeed();
  await page.goto("/admin/autopilot");
  await expect(page.getByText("Autopilot publishes without review")).toBeVisible();
  await expect(page.getByText(voice.name).first()).toBeVisible(); // the banner names the default voice

  const blog = card(page, "Blog articles");
  await expect(blog.getByRole("button", { name: "Run now" })).toBeDisabled(); // off until saved on
  await blog.getByRole("checkbox", { name: "Blog articles autopilot on" }).check();
  await blog.getByLabel("Create new content").selectOption("24");
  await blog.getByLabel("Articles per run").fill("2");
  await blog.getByLabel("Length").selectOption("800");
  await blog.getByRole("button", { name: "Save" }).click();
  await expect(blog.getByText("Saved.")).toBeVisible();

  const { data: schedule } = await admin().from("autopilot_schedules").select("*").eq("workspace_id", workspaceId).eq("kind", "blog").single();
  expect(schedule.enabled).toBe(true);
  expect(schedule.config).toMatchObject({ articlesPerRun: 2, lengthWords: 800 });
  expect(new Date(schedule.next_run_at).getTime()).toBeGreaterThan(Date.now() + 23 * 3600e3); // first run one interval out

  await expect(blog.getByRole("button", { name: "Run now" })).toBeEnabled();
  await blog.getByRole("button", { name: "Run now" }).click();
  await expect(blog.getByText("Recent runs")).toBeVisible();

  expect(await untilRunCloses(request, "blog")).toBe("done");

  // The engine was asked to recommend topics (none given), in the default voice, the second avoiding the first.
  const asked = (await engineRequests(request, "/v1/blog/generate")).filter((p) => p.workspace_id === workspaceId);
  expect(asked).toHaveLength(2);
  expect(asked.every((p) => p.topic === null && p.length_words === 800)).toBe(true);
  expect(asked[0].tone).toContain(voice.description);
  expect(asked[0].tone).toContain(voice.example);
  expect(asked[1].avoid_topics).toEqual([expect.stringContaining("E2E recommended topic")]);

  // Published without review: the first now, the second scheduled half an interval later.
  const { data: runRow } = await admin().from("autopilot_runs").select("*").eq("workspace_id", workspaceId).eq("kind", "blog").single();
  const { data: posts } = await admin().from("blog_posts").select("*").eq("workspace_id", workspaceId).order("created_at");
  expect(posts).toHaveLength(2);
  expect(posts!.every((p) => p.ai_generated && p.reviewed_by === null)).toBe(true);
  expect(posts![0].status).toBe("published");
  expect(posts![1].status).toBe("scheduled");
  const offsetH = (new Date(posts![1].published_at).getTime() - new Date(runRow.started_at).getTime()) / 3600e3;
  expect(offsetH).toBeGreaterThan(11.9);
  expect(offsetH).toBeLessThan(12.1);
  const { data: jobs } = await admin().from("blog_generation_jobs").select("request").eq("workspace_id", workspaceId);
  expect(jobs!.every((j: any) => j.request.autopilot?.runId === runRow.id && j.request.topic?.startsWith("E2E recommended topic"))).toBe(true);

  await page.reload();
  const runs = card(page, "Blog articles").locator("details");
  await expect(runs.first()).toContainText("done");
  await expect(runs.first()).toContainText("2 published");
});

test("social autopilot schedules the recommended posts and builds the video with the voice's narrator", async ({ page, request }) => {
  const { workspaceId, accounts } = readSeed();
  await page.goto("/admin/autopilot");
  const social = card(page, "Social posts");
  await social.getByRole("checkbox", { name: "Social posts autopilot on" }).check();
  await social.getByLabel("Create new content").selectOption("24");
  // Only connected accounts are offered (the seeded Facebook page is expired); post to LinkedIn only.
  await expect(social.getByRole("checkbox", { name: /Facebook/ })).toHaveCount(0);
  await social.getByRole("checkbox", { name: /@propertypro_sg/ }).uncheck();
  await expect(social.getByRole("checkbox", { name: /@propertypro$/ })).toBeChecked();
  await social.getByLabel("Text posts per run").fill("1");
  await social.getByLabel("Image posts per run").fill("0");
  await social.getByLabel("Videos per run").fill("1");
  await social.getByLabel("Video length").selectOption("15");
  await social.getByLabel("Goals (optional)").fill("Drive valuation requests");
  await social.getByRole("button", { name: "Save" }).click();
  await expect(social.getByText("Saved.")).toBeVisible();

  await expect(social.getByRole("button", { name: "Run now" })).toBeEnabled();
  await social.getByRole("button", { name: "Run now" }).click();
  await expect(social.getByText("Recent runs")).toBeVisible();

  expect(await untilRunCloses(request, "social")).toBe("done");

  const [generate] = (await engineRequests(request, "/v1/generate")).filter((p) => p.workspace_id === workspaceId && p.goals?.includes("Drive valuation requests"));
  expect(generate.post_plan).toEqual([
    { type: "text", count: 1, platforms: ["linkedin"] },
    { type: "video", count: 1, platforms: ["linkedin"] },
  ]);
  expect(generate.brand.voice).toContain(voice.description);
  expect(generate.video_spec).toEqual({ aspect: "9:16", duration_s: 15 });

  // The recommended concept was approved with the default voice's narrator, unedited.
  const builds = (await engineRequests(request, "/v1/video/build")).filter((p) => p.workspace_id === workspaceId);
  const build = builds.at(-1);
  expect(build).toMatchObject({ concept: "alpha", voice: voice.narrator, captions: true });
  expect(build.script).toEqual(["What is your flat worth today?", "Type your postal code and see it in seconds."]);

  // Both posts are scheduled on LinkedIn inside the interval, from approved drafts.
  const { data: runRow } = await admin().from("autopilot_runs").select("*").eq("workspace_id", workspaceId).eq("kind", "social").single();
  const draftIds = (runRow.items as any[]).filter((i) => i.kind === "draft").map((i) => i.ref);
  expect(draftIds).toHaveLength(2);
  const { data: posts } = await admin().from("social_posts").select("*, targets:social_post_targets(*)").in("draft_id", draftIds);
  expect(posts).toHaveLength(2);
  const end = new Date(runRow.ends_at).getTime();
  for (const p of posts!) {
    expect(p.status).toBe("scheduled");
    expect(p.source).toBe("ai");
    expect(new Date(p.scheduled_at).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(p.scheduled_at).getTime()).toBeLessThanOrEqual(end);
    expect(p.targets).toHaveLength(1);
    expect(p.targets[0]).toMatchObject({ account_id: accounts.linkedin, platform: "linkedin", status: "pending" });
  }
  const video = posts!.find((p) => p.format === "video")!;
  expect(video.media_ids).toHaveLength(1);
  expect(video.content).toContain("E2E Concept Alpha caption");
  expect(video.content).toContain("#SGProperty");
  const text = posts!.find((p) => p.format === "text")!;
  expect(text.content).toContain("E2E text draft 1 for linkedin");
  const { data: drafts } = await admin().from("social_generated_drafts").select("status").in("id", draftIds);
  expect(drafts!.every((d) => d.status === "approved")).toBe(true);

  await page.reload();
  const runs = card(page, "Social posts").locator("details");
  await expect(runs.first()).toContainText("done");
  await expect(runs.first()).toContainText("2 published");
});

test("a run never overlaps: Run now refuses while one is in progress", async ({ page }) => {
  const { workspaceId } = readSeed();
  const db = admin();
  const { data: s } = await db.from("autopilot_schedules").select("id").eq("workspace_id", workspaceId).eq("kind", "blog").single();
  const { data: open } = await db
    .from("autopilot_runs")
    .insert({ workspace_id: workspaceId, schedule_id: s!.id, kind: "blog", ends_at: new Date(Date.now() + 864e5).toISOString(), config: { articlesPerRun: 1 }, items: [{ kind: "blog_job", ref: crypto.randomUUID(), state: "pending" }] })
    .select("id")
    .single();
  try {
    await page.goto("/admin/autopilot");
    await card(page, "Blog articles").getByRole("button", { name: "Run now" }).click();
    await expect(card(page, "Blog articles").getByText("A run is already in progress")).toBeVisible();
  } finally {
    await db.from("autopilot_runs").delete().eq("id", open!.id);
  }
});
