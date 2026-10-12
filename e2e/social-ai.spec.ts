import { expect, test, type Page } from "@playwright/test";
import { APP_URL, ENGINE_URL } from "./support/constants";
import { dialog } from "./support/ui";

// AI studio → content engine (the stub) → signed callback → drafts to review → scheduled / rejected → Generated tab.
test.describe.configure({ mode: "serial" });

const audience = "E2E audience: HDB owners upgrading to condos";
const imageTitle = "E2E image idea 1";
const textTitle = "E2E text idea 1";

const draftCard = (page: Page, title: string) => page.locator("div", { has: page.getByText(title, { exact: true }) }).filter({ has: page.getByRole("button", { name: "Reject" }) }).last();

/** Leaves exactly the given platforms selected for one post type row. */
async function onlyPlatforms(page: Page, type: string, platforms: string[]) {
  const row = page.getByRole("group", { name: "What to make" }).locator(":scope > div").filter({ hasText: type });
  for (const button of await row.getByRole("button").all()) {
    if (await button.isDisabled()) continue;
    const want = platforms.includes((await button.innerText()).replace("·", "").trim());
    if ((await button.getAttribute("aria-pressed")) !== String(want)) await button.click();
  }
}

test("brand profile: defaults from the site, edit and save", async ({ page }) => {
  await page.goto("/admin/social/ai");
  await expect(page.getByRole("heading", { name: "AI studio" })).toBeVisible();
  // Pre-filled from the site's TOTALWEB_BRAND until the workspace saves its own.
  await expect(page.getByText(/PropertyPro AI · Personal real estate agent platform/)).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Brand name")).toHaveValue("PropertyPro AI");
  await page.getByLabel("Website").fill(APP_URL);
  await page.getByLabel("Audience").fill(audience);
  await page.getByLabel("Voice").fill("Calm, precise, plain-spoken");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText(`for ${audience}`)).toBeVisible();

  await page.reload();
  await expect(page.getByText(`for ${audience}`)).toBeVisible();
});

test("generate posts: plan per type and platform, engine results become drafts", async ({ page, request }) => {
  await page.goto("/admin/social/ai");
  await page.getByLabel("How many Image with text posts").fill("1");
  await page.getByLabel("How many Video posts").fill("0");
  await page.getByLabel("How many Text only posts").fill("1");
  await onlyPlatforms(page, "Image with text", ["LinkedIn"]);
  await onlyPlatforms(page, "Text only", ["LinkedIn"]);
  await expect(page.getByText("2 drafts: 1 image with text × 1 platform · 1 text only × 1 platform")).toBeVisible();
  await page.getByLabel("Goal for this batch (optional)").fill("Promote free valuations in Punggol");

  await page.getByRole("button", { name: "Generate" }).click();
  await expect(draftCard(page, imageTitle)).toBeVisible({ timeout: 60_000 }); // the page polls while the job runs
  await expect(draftCard(page, textTitle)).toBeVisible();

  const image = draftCard(page, imageTitle);
  await expect(image).toContainText("Image with text");
  await expect(image).toContainText("#SGProperty #HDB");
  await expect(image.locator("img")).toBeVisible(); // generated media was imported into the workspace
  await expect(page.getByRole("heading", { name: "What the engine learned" })).toBeVisible();
  await expect(page.getByText("E2E insight: valuation explainers get twice the engagement")).toBeVisible();
  const cost = page.locator("div", { has: page.getByRole("heading", { name: "Cost of the last generation" }) }).last();
  await expect(cost).toContainText("$0.01in 42 s");
  await expect(page.getByRole("row", { name: /Research \(site, competitors, trends\)/ })).toContainText("1K / 200");

  // What the app sent the engine: the saved brand profile and exactly the plan chosen above.
  const sent = (await (await request.get(`${ENGINE_URL}/__requests`)).json()) as { path: string; payload: any }[];
  const generate = sent.filter((r) => r.path === "/v1/generate").at(-1)!.payload;
  expect(generate.brand).toMatchObject({ name: "PropertyPro AI", website: APP_URL, audience });
  expect(generate.goals).toBe("Promote free valuations in Punggol");
  expect(generate.post_plan).toEqual([
    { type: "image", count: 1, platforms: ["linkedin"] },
    { type: "text", count: 1, platforms: ["linkedin"] },
  ]);
  expect(generate.callback_url).toBe(`${APP_URL}/api/social/engine/callback`);
});

test("review drafts: reject one, schedule the other from the composer", async ({ page }) => {
  await page.goto("/admin/social/ai");
  await draftCard(page, textTitle).getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText(textTitle, { exact: true })).toHaveCount(0);

  await draftCard(page, imageTitle).getByRole("button", { name: "Review & schedule" }).click();
  const composer = dialog(page, "Create post");
  await expect(composer.getByPlaceholder("What do you want to share?")).toHaveValue(/E2E image draft 1 for linkedin[\s\S]*#SGProperty #HDB/);
  await expect(composer.getByRole("button", { name: "PropertyPro LinkedIn", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(composer.getByText("1 selected")).toBeVisible();
  await expect(composer.getByLabel("Topic (for analytics)")).toHaveValue("HDB valuations");
  await composer.getByRole("button", { name: "Schedule" }).click();
  await expect(composer).toBeHidden();
  await expect(page.getByText("No drafts waiting")).toBeVisible();
});

test("generated posts: filter by status, restore a rejected draft, open the detail view", async ({ page }) => {
  await page.goto("/admin/social/generated");
  await expect(page.getByRole("heading", { name: "Generated posts" })).toBeVisible();
  await expect(page.getByText("2 of 2 generated posts")).toBeVisible();
  const status = page.getByRole("group", { name: "Status" });
  await expect(status.getByRole("button", { name: /Scheduled/ })).toContainText("1");
  await expect(status.getByRole("button", { name: /Rejected/ })).toContainText("1");

  await status.getByRole("button", { name: /Rejected/ }).click();
  await expect(page).toHaveURL(/status=rejected/);
  await expect(page.getByText("1 of 2 generated posts")).toBeVisible();
  await page.getByRole("button", { name: "Restore to review" }).click();
  await expect(page.getByText("Nothing matches these filters")).toBeVisible();
  await expect(status.getByRole("button", { name: /Not published/ })).toContainText("1");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/status=/);

  // Filters survive a reload because they live in the URL.
  await page.goto("/admin/social/generated?status=scheduled");
  await expect(page.getByText("1 of 2 generated posts")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open in calendar" })).toHaveAttribute("href", /\/admin\/social\?month=\d{4}-\d{2}/);

  await page.getByRole("button", { name: imageTitle }).click();
  const detail = dialog(page, imageTitle);
  await expect(detail).toContainText("Scheduled");
  await expect(detail).toContainText("HDB valuations");
  await expect(detail.getByText("Valuation posts outperform listing posts")).toBeHidden(); // inside "Why this post"
  await detail.getByText("Why this post").click();
  await expect(detail.getByText("Valuation posts outperform listing posts")).toBeVisible();
  await detail.getByRole("button", { name: "Status" }).click();
  const statusModal = dialog(page, "Post status");
  await expect(statusModal.getByRole("listitem").filter({ hasText: "LinkedIn" })).toContainText("Scheduled for");
  await statusModal.getByRole("button", { name: "Close" }).click();

  // The restored draft is back in the AI studio's review list.
  await page.goto("/admin/social/ai");
  await expect(draftCard(page, textTitle)).toBeVisible();
});

test("competitors found during generation are tracked", async ({ page }) => {
  await page.goto("/admin/social/competitors");
  const rival = page.locator("div.space-y-2", { has: page.getByText("E2E Rival Realty", { exact: true }) });
  await expect(rival).toContainText("AI found");
  await expect(rival).toContainText("Same audience");
});
