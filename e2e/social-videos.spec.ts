import { expect, test, type Page } from "@playwright/test";
import { APP_URL, ENGINE_URL } from "./support/constants";
import { admin, readSeed } from "./support/db";
import { dialog } from "./support/ui";

// Video director: demo logins → request → proposal (three concepts) → edit script → approve → film → schedule it.
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const title = `E2E valuation film ${run}`;
const login = { role: "homeowner", email: `demo.${run}@example.com`, password: `demo-pass-${run}` };
const failedRetry = `E2E failed proposal ${run}`;
const failedDelete = `E2E failed build ${run}`;

const projects = (page: Page) => page.getByRole("list", { name: "Videos" });
const project = (page: Page, name: string) => projects(page).getByRole("button", { name: new RegExp(name) });
const sentToEngine = async (page: Page, path: string) =>
  ((await (await page.request.get(`${ENGINE_URL}/__requests`)).json()) as { path: string; payload: any }[]).filter((r) => r.path === path).at(-1)!.payload;

test.beforeAll(async () => {
  const { workspaceId } = readSeed();
  const db = admin();
  // The director films the brand's website, so the profile needs one (the AI studio spec also sets it through the UI).
  const { data } = await db.from("workspaces").select("settings").eq("id", workspaceId).single();
  const settings = (data?.settings ?? {}) as Record<string, any>;
  await db.from("workspaces").update({ settings: { ...settings, brand: { ...(settings.brand ?? {}), website: APP_URL } } }).eq("id", workspaceId);

  const request = { format: "social", aspect: "9:16", length_s: 15, goal: "Seeded", focus: [], platforms: [], use_logins: false, voice_mode: "voiceover" };
  const { error } = await db.from("social_video_projects").insert([
    { workspace_id: workspaceId, title: failedRetry, request, status: "failed", error: "Seeded: research timed out" },
    { workspace_id: workspaceId, title: failedDelete, request, status: "failed", error: "Seeded: render crashed" },
  ]);
  if (error) throw error;
});

test("demo logins are saved with an encrypted password", async ({ page }) => {
  await page.goto("/admin/social/videos");
  await expect(page.getByRole("heading", { name: "Videos" })).toBeVisible();
  const card = page.getByRole("heading", { name: "Demo logins" }).locator("../..");
  await expect(card).toContainText("None: public pages only.");

  await card.getByRole("button", { name: "Add", exact: true }).click();
  await card.getByRole("button", { name: "+ Add login" }).click();
  await card.getByLabel("Role").fill(login.role);
  await card.getByLabel("Login URL").fill("/login");
  await card.getByLabel("Email").fill(login.email);
  await card.getByLabel("Password").fill(login.password);
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card).toContainText(login.role);
  await expect(card).toContainText(login.email);

  await page.reload();
  await card.getByRole("button", { name: "Edit" }).click();
  await expect(card.getByLabel("Password")).toHaveValue(""); // never sent back to the browser
  await expect(card.getByLabel("Password")).toHaveAttribute("placeholder", "•••••••• (saved; type to change)");
  await card.getByRole("button", { name: "Close" }).click();
});

test("request a video: the director proposes three concepts", async ({ page }) => {
  await page.goto("/admin/social/videos");
  const form = page.locator("form", { has: page.getByRole("button", { name: "Research & propose" }) });
  if (!(await form.isVisible())) await page.getByRole("button", { name: "New video" }).click();

  await form.getByRole("button", { name: /Feed ad/ }).click();
  await expect(form.getByRole("button", { name: /Feed ad/ })).toHaveAttribute("aria-pressed", "true");
  await form.getByRole("button", { name: /Social ad/ }).click();
  await form.getByRole("button", { name: /On-screen text \+ music/ }).click();
  await form.getByRole("button", { name: /^Voiceover/ }).click();
  await form.getByRole("combobox").selectOption("15");
  await form.getByPlaceholder("e.g. Autumn launch demo").fill(title);
  await form.getByLabel("What should the video achieve?").fill("Show an HDB owner getting an instant valuation, then booking the agent");
  await form.getByLabel("Features to feature (comma separated, optional)").fill("postal code lookup, valuation report");
  await form.getByRole("button", { name: "TikTok", exact: true }).click(); // on by default; leaves Instagram
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Research & propose" }).click();

  await expect(project(page, title)).toBeVisible();
  await expect(project(page, title)).toContainText("Ready for your review", { timeout: 60_000 }); // polls while proposing
  await expect(page).toHaveURL(/project=[0-9a-f-]{36}/);

  const sent = await sentToEngine(page, "/v1/video/proposal");
  expect(sent).toMatchObject({
    format: "social",
    aspect: "9:16",
    length_s: 15,
    voice_mode: "voiceover",
    platforms: ["instagram"],
    focus: ["postal code lookup", "valuation report"],
    brand: { website: APP_URL },
  });
  // The demo login reaches the engine decrypted, and only there.
  expect(sent.demo_accounts).toEqual([{ role: login.role, login_url: "/login", email: login.email, password: login.password, notes: null }]);
});

test("review the proposal: switch concepts, edit the script, approve, get the film", async ({ page }) => {
  await page.goto("/admin/social/videos");
  await project(page, title).click();
  await expect(page.getByText("Researched 5 pages, public pages only.")).toBeVisible();

  const alpha = page.getByRole("button", { name: /E2E Concept Alpha/ });
  await expect(alpha).toHaveAttribute("aria-pressed", "true");
  await expect(alpha).toContainText("Recommended");
  await expect(page.getByLabel("Line 1")).toHaveValue("What is your flat worth today?");

  await page.getByRole("button", { name: /E2E Concept Beta/ }).click();
  await expect(page.getByLabel("Line 1")).toHaveValue("Selling soon? Start with the numbers.");
  await expect(page.getByLabel("Line 2")).toHaveCount(0);
  await alpha.click();

  await page.getByLabel("Line 2").fill("Type your postal code. See your price in seconds.");
  await page.getByRole("button", { name: "+ Add line" }).click();
  await page.getByLabel("Line 3").fill("Then talk it through with a real agent.");
  await expect(page.getByRole("radio", { name: /Heart \(US, warm\)/ })).toBeChecked();
  await page.getByRole("button", { name: "Approve & build" }).click();

  await expect(project(page, title)).toContainText("Done", { timeout: 60_000 });
  await expect(page.locator("video")).toHaveAttribute("src", /^https:\/\//); // imported into the workspace's storage
  const facts = page.locator("dl").last();
  await expect(facts).toContainText("E2E Concept Alpha");
  await expect(facts).toContainText("Heart (US, warm)");
  await expect(facts).toContainText("E2E film caption");
  await expect(facts).toContainText("Passed");
  await expect(facts).toContainText("4 captured · 2 write requests blocked");
  await expect(page.getByText(/Cost: proposal \$0\.05 · film \$0\.40 · total \$0\.45/)).toBeVisible();

  const sent = await sentToEngine(page, "/v1/video/build");
  expect(sent).toMatchObject({
    concept: "alpha",
    voice: "af_heart",
    captions: true,
    script: ["What is your flat worth today?", "Type your postal code. See your price in seconds.", "Then talk it through with a real agent."],
  });
});

test("schedule the finished film as a post", async ({ page }) => {
  await page.goto("/admin/social/videos");
  await project(page, title).click();
  await page.getByRole("button", { name: "Schedule this video" }).click();
  const composer = dialog(page, "Create post");
  await expect(composer.getByPlaceholder("What do you want to share?")).toHaveValue(
    "What is your flat worth today?\n\nThen talk it through with a real agent.",
  );
  await expect(composer.getByText("1 selected")).toBeVisible();
  await composer.getByRole("button", { name: "PropertyPro LinkedIn", exact: true }).click();
  await composer.getByRole("button", { name: "Schedule" }).click();
  await expect(composer).toBeHidden();

  await page.goto("/admin/social/history");
  const row = page.getByRole("row", { name: /What is your flat worth today\?/ });
  await expect(row).toContainText("LinkedIn");
  await expect(row).toContainText("scheduled");
});

test("failed videos can be retried or deleted", async ({ page }) => {
  await page.goto("/admin/social/videos");
  await project(page, failedDelete).click();
  await expect(page.getByText("Seeded: render crashed")).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(project(page, failedDelete)).toHaveCount(0);

  await project(page, failedRetry).click();
  await expect(page.getByText("Seeded: research timed out")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  // No approved script yet, so the retry asks for a new proposal.
  await expect(project(page, failedRetry)).toContainText("Ready for your review", { timeout: 60_000 });
  await expect(page.getByRole("button", { name: /E2E Concept Alpha/ })).toBeVisible();
});
