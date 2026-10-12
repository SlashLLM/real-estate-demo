import { expect, test, type Page } from "@playwright/test";
import { dialog, isoDate } from "./support/ui";

// Composer → calendar → status → edit, drafts, and history. The seeded accounts hold undecryptable tokens, and nothing
// here clicks "Publish now": that runs the publisher for every workspace in the shared database.
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const scheduled = `E2E ${run} open house this Saturday in Tampines`;
const edited = `E2E ${run} open house moved to Sunday in Tampines`;
const withImage = `E2E ${run} sold above valuation in Bishan`;
const draft = `E2E ${run} draft about MOP timing`;
const day = isoDate(3);
const month = day.slice(0, 7);
const monthLabel = (ym: string) =>
  new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

const whenSelect = (page: Page) => dialog(page, "Create post").locator("select").filter({ has: page.locator('option[value="now"]') });

test("the calendar shows the month and pages between months", async ({ page }) => {
  await page.goto(`/admin/social?month=${month}`);
  await expect(page.getByRole("heading", { name: monthLabel(month) })).toBeVisible();
  for (const d of ["Sun", "Mon", "Sat"]) await expect(page.getByText(d, { exact: true })).toBeVisible();

  const next = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1);
  const nextMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page).toHaveURL(new RegExp(`month=${nextMonth}`));
  await expect(page.getByRole("heading", { name: monthLabel(nextMonth) })).toBeVisible();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page).toHaveURL(new RegExp(`month=${month}`));
});

test("compose a post from a calendar day for two accounts, with a platform-specific version, and schedule it", async ({ page }) => {
  await page.goto(`/admin/social?month=${month}`);
  const [y, m, d] = day.split("-").map(Number);
  await page.getByRole("button", { name: `Create post on ${new Date(y, m - 1, d).toDateString()}` }).click();
  const composer = dialog(page, "Create post");
  await expect(composer.locator('input[type="datetime-local"]')).toHaveValue(`${day}T10:00`); // the day's 10 am slot

  // Only active accounts can be picked: the expired Facebook page is not offered.
  await expect(composer.getByRole("button", { name: "PropertyPro Facebook Page" })).toHaveCount(0);
  await expect(composer.getByText("Select an account to preview.")).toBeVisible();
  const linkedin = composer.getByRole("button", { name: "PropertyPro LinkedIn", exact: true });
  const x = composer.getByRole("button", { name: "PropertyPro on X", exact: true });
  await linkedin.click();
  await x.click();
  await expect(linkedin).toHaveAttribute("aria-pressed", "true");
  await expect(x).toHaveAttribute("aria-pressed", "true");

  await composer.getByPlaceholder("What do you want to share?").fill(`${scheduled}. Viewing 10am to 4pm, DM for the address.`);
  await composer.getByLabel("Link").fill("https://propertypro.example.com/listings/tampines");
  await composer.getByLabel("Topic (for analytics)").fill("open house");
  await composer.getByLabel("Privacy").selectOption("CONNECTIONS");
  // The live preview follows the text.
  await expect(composer.getByText("Viewing 10am to 4pm").last()).toBeVisible();

  // X gets its own copy; going over 280 characters blocks scheduling until it is fixed.
  await composer.getByRole("button", { name: "X (Twitter)" }).first().click();
  const xText = composer.locator("textarea");
  await xText.fill("x".repeat(300));
  await expect(composer.getByText("PropertyPro on X: Text is 300/280 characters")).toBeVisible();
  await expect(composer.getByRole("button", { name: "Schedule" })).toBeDisabled();
  await composer.getByRole("button", { name: "Use shared text" }).click();
  await xText.fill(`${scheduled} #SGProperty`);
  await expect(composer.getByText(/Text is \d+\/280/)).toHaveCount(0);
  await expect(composer.getByRole("button", { name: "X (Twitter) •" })).toBeVisible();

  // "Publish now" is offered (not clicked, see above), then back to a scheduled time.
  await whenSelect(page).selectOption("now");
  await expect(composer.getByRole("button", { name: "Publish now" })).toBeEnabled();
  await expect(composer.locator('input[type="datetime-local"]')).toHaveCount(0);
  await whenSelect(page).selectOption("later");
  await composer.getByRole("button", { name: "Schedule" }).click();
  await expect(composer).toBeHidden();

  const entry = page.getByRole("button", { name: new RegExp(`10:00 AM ${scheduled.slice(0, 30)}`) });
  await expect(entry).toBeVisible();
  await entry.click();
  const status = dialog(page, "Post status");
  await expect(status.getByRole("listitem")).toHaveCount(2);
  await expect(status.getByRole("listitem").filter({ hasText: "LinkedIn" })).toContainText("Scheduled for");
  await expect(status.getByRole("listitem").filter({ hasText: "X (Twitter)" })).toContainText("Scheduled for");
});

test("a scheduled post can be edited while nothing has gone out", async ({ page }) => {
  await page.goto(`/admin/social?month=${month}`);
  await page.getByRole("button", { name: new RegExp(scheduled.slice(0, 30)) }).click();
  await dialog(page, "Post status").getByRole("button", { name: "Edit" }).click();

  const composer = dialog(page, "Edit post");
  const text = composer.getByPlaceholder("What do you want to share?");
  await expect(text).toHaveValue(new RegExp(scheduled));
  await expect(composer.getByRole("button", { name: "X (Twitter) •" })).toBeVisible(); // the X version was kept
  await text.fill(`${edited}. Viewing 10am to 4pm.`);
  await composer.locator('input[type="datetime-local"]').fill(`${day}T15:30`);
  await composer.getByRole("button", { name: "Schedule" }).click();
  await expect(composer).toBeHidden();

  await expect(page.getByRole("button", { name: new RegExp(`3:30 PM ${edited.slice(0, 30)}`) })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(scheduled.slice(0, 30)) })).toHaveCount(0);
});

test("upload an image in the composer and schedule an image post", async ({ page }) => {
  await page.goto(`/admin/social?month=${month}`);
  await page.getByRole("button", { name: "Create post", exact: true }).click();
  const composer = dialog(page, "Create post");
  await composer.getByRole("button", { name: "PropertyPro LinkedIn", exact: true }).click();
  await composer.getByPlaceholder("What do you want to share?").fill(withImage);

  await composer.locator('input[type="file"]').setInputFiles("public/images/doodle/house-still.webp");
  await expect(composer.getByText("1 selected")).toBeVisible();
  await expect(composer.getByRole("button", { name: "1" })).toHaveAttribute("aria-pressed", "true");

  await composer.locator('input[type="datetime-local"]').fill(`${day}T18:00`);
  await composer.getByRole("button", { name: "Schedule" }).click();
  await expect(composer).toBeHidden();
  await expect(page.getByRole("button", { name: new RegExp(`6:00 PM ${withImage.slice(0, 30)}`) })).toBeVisible();

  // The uploaded image is in the media library for the next post.
  await page.getByRole("button", { name: "Create post", exact: true }).click();
  await expect(dialog(page, "Create post").locator("img").first()).toBeVisible();
});

test("save a draft and reopen it from the unscheduled drafts", async ({ page }) => {
  await page.goto(`/admin/social?month=${month}`);
  await page.getByRole("button", { name: "Create post", exact: true }).click();
  const composer = dialog(page, "Create post");
  await composer.getByRole("button", { name: "PropertyPro on X", exact: true }).click();
  await composer.getByPlaceholder("What do you want to share?").fill(draft);
  await composer.getByRole("button", { name: "Save draft" }).click();
  await expect(composer).toBeHidden();

  await expect(page.getByRole("heading", { name: "Unscheduled drafts" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(draft) }).click();
  const editor = dialog(page, "Edit post");
  await expect(editor.getByPlaceholder("What do you want to share?")).toHaveValue(draft);
  await expect(editor.getByRole("button", { name: "PropertyPro on X", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("history lists sent and scheduled posts; failed posts can be retried and posts deleted", async ({ page }) => {
  await page.goto("/admin/social/history");
  await expect(page.getByRole("heading", { name: "Post history" })).toBeVisible();

  const published = page.getByRole("row", { name: /Tampines HDB resale prices rose 3%/ });
  await expect(published).toContainText("published");
  await expect(published.getByRole("link", { name: "view" })).toHaveAttribute("href", "https://www.linkedin.com/feed/update/e2e-seeded");

  // Scheduled posts from the composer are listed; drafts are not.
  await expect(page.getByRole("row", { name: new RegExp(edited.slice(0, 30)) })).toContainText("scheduled");
  await expect(page.getByRole("row", { name: new RegExp(withImage.slice(0, 30)) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(draft) })).toHaveCount(0);

  const failed = page.getByRole("row", { name: /lease decay explained/ });
  await expect(failed).toContainText("Seeded failure: token rejected by X");
  await failed.getByRole("button", { name: "Retry" }).click();
  await expect(failed.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(failed).not.toContainText("Seeded failure");
  await expect(failed).toContainText("pending");

  page.once("dialog", (d) => d.accept());
  await failed.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("row", { name: /lease decay explained/ })).toHaveCount(0);
});
