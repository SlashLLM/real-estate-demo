import { expect, test } from "@playwright/test";
import { readSeed } from "./support/db";

// Dates, "today", "overdue" and number formats depend on the viewer's timezone and locale, which the server doesn't
// know. A browser that differs from the server on both must still hydrate every admin page without a mismatch
// (React error #418), and show times in its own timezone.
test.use({ timezoneId: "America/Los_Angeles", locale: "en-IN" });

const PAGES = [
  "/admin/social",
  "/admin/social/ai",
  "/admin/social/generated",
  "/admin/social/history",
  "/admin/social/videos",
  "/admin/social/analytics",
  "/admin/blog",
  "/admin/blog/generate",
  "/admin/crm",
  "/admin/crm/contacts",
  "/admin/crm/deals",
  "/admin/crm/tasks",
  "/admin/autopilot",
];

for (const path of PAGES) {
  test(`${path} hydrates without a mismatch`, async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && /hydrat|#418|#425|did not match/i.test(m.text())) problems.push(m.text().slice(0, 4000));
    });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });
}

test("history shows times in the viewer's timezone", async ({ page }) => {
  readSeed(); // the seeded published post (3 days ago) is in the history
  await page.goto("/admin/social/history");
  const time = page.locator("time[datetime]").first();
  await expect(time).toBeVisible();
  const iso = (await time.getAttribute("datetime"))!;
  const local = await page.evaluate((i) => new Date(i).toLocaleString(), iso);
  await expect(time).toHaveText(local);
});
