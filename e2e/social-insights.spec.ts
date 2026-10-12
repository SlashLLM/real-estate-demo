import { expect, test } from "@playwright/test";
import { expectStat } from "./support/ui";

test.describe.configure({ mode: "serial" });

test("accounts: connected accounts, expired ones offer a reconnect, platforms need app credentials", async ({ page }) => {
  await page.goto("/admin/social/accounts");
  await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();

  const card = (name: string) => page.locator("div", { has: page.getByText(name, { exact: true }) }).filter({ has: page.getByRole("button", { name: "Disconnect" }) }).last();
  await expect(card("PropertyPro LinkedIn")).toContainText("LinkedIn · @propertypro");
  await expect(card("PropertyPro on X")).toContainText("X (Twitter) · @propertypro_sg");
  const facebook = card("PropertyPro Facebook Page");
  await expect(facebook).toContainText("expired");
  await expect(facebook).toContainText("Token expired: reconnect the page");
  await expect(facebook.getByRole("link")).toHaveAttribute("href", "/api/social/connect/facebook");
  await expect(card("PropertyPro LinkedIn").getByRole("button", { name: "Reconnect" })).toHaveCount(0);

  // No platform app credentials in this environment, so every platform explains how to enable it.
  await expect(page.getByText("Add app credentials to .env to enable.")).toHaveCount(8);
});

test("accounts: OAuth results are reported after the redirect back", async ({ page }) => {
  await page.goto("/admin/social/accounts?connected=linkedin");
  await expect(page.getByText("Connected LinkedIn.")).toBeVisible();
  await page.goto(`/admin/social/accounts?error=${encodeURIComponent("The platform denied access")}`);
  await expect(page.getByText("The platform denied access")).toBeVisible();
});

test("accounts: disconnect asks for confirmation and removes the account", async ({ page }) => {
  await page.goto("/admin/social/accounts");
  const facebook = page.locator("div", { has: page.getByText("PropertyPro Facebook Page", { exact: true }) }).filter({ has: page.getByRole("button", { name: "Disconnect" }) }).last();

  // Dismissing the confirmation keeps it.
  page.once("dialog", (d) => {
    expect(d.message()).toBe("Disconnect PropertyPro Facebook Page? Scheduled posts to it will be removed.");
    void d.dismiss();
  });
  await facebook.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByText("PropertyPro Facebook Page", { exact: true })).toBeVisible();

  page.once("dialog", (d) => void d.accept());
  await facebook.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByText("PropertyPro Facebook Page", { exact: true })).toHaveCount(0);
  await expect(page.getByText("PropertyPro LinkedIn", { exact: true })).toBeVisible();
});

test("analytics: totals, per-platform engagement and top posts from synced metrics", async ({ page }) => {
  await page.goto("/admin/social/analytics");
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expectStat(page, "Posts (30d)", "1");
  await expectStat(page, "Reach", "1.2K");
  await expectStat(page, "Engagements", "50", "4.2% engagement rate"); // likes + comments + shares + saves over reach
  await expectStat(page, "Follower growth", "+30");

  await expect(page.getByText("50 eng · 1.2K reach · 1 posts")).toBeVisible();
  await expect(page.getByRole("grid", { name: "Average engagement heatmap" })).toBeVisible();
  const top = page.getByRole("listitem").filter({ hasText: "Tampines HDB resale prices rose 3%" });
  await expect(top).toContainText("♥ 40 · 💬 5 · ↗ 3");
  await expect(top.getByRole("link", { name: "open" })).toHaveAttribute("href", "https://www.linkedin.com/feed/update/e2e-seeded");

  // The window comes from ?days= (clamped to 7..365).
  await page.goto("/admin/social/analytics?days=2");
  await expectStat(page, "Posts (7d)", "1");
});

test("competitors: add one by hand, discover more with the engine, remove one", async ({ page }) => {
  const manual = `E2E Manual Rival ${Date.now().toString(36)}`;
  await page.goto("/admin/social/competitors");
  await expect(page.getByRole("heading", { name: "Competitors" })).toBeVisible();

  await page.getByPlaceholder("Competitor name").fill(manual);
  await page.getByPlaceholder("https://their-site.com").fill("https://manual-rival.example.com");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const card = (name: string) => page.locator("div.space-y-2", { has: page.getByText(name, { exact: true }) });
  const added = card(manual);
  await expect(added).toContainText("manual");
  await expect(added.getByRole("link", { name: "manual-rival.example.com" })).toBeVisible();

  await page.getByRole("button", { name: "Find competitors with AI" }).click();
  const found = card("E2E Discovered Agency");
  await expect(found).toContainText("AI found");
  await expect(found).toContainText("Ranks for HDB valuation searches");
  await expect(found).toContainText("instagram: @discovered");
  await expect(found).toContainText("HDB upgrading");
  await expect(found).toContainText("Posts daily");

  await page.getByRole("button", { name: `Remove ${manual}` }).click();
  await expect(page.getByText(manual, { exact: true })).toHaveCount(0);
});
