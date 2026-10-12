import { expect, test } from "@playwright/test";
import { newTestUser } from "./support/constants";
import { admin, deleteTestUser, readSeed } from "./support/db";

// Signed out. Sign-out revokes every session of a user, so these tests use their own throwaway user rather than the
// suite's shared admin session.
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "serial" });

const user = newTestUser();
let userId = "";

test.beforeAll(async () => {
  const { data, error } = await admin().auth.admin.createUser({ ...user, email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
});

test.afterAll(async () => {
  if (userId) await deleteTestUser(userId);
});

test("admin pages redirect to sign-in and keep the destination", async ({ page }) => {
  await page.goto("/admin/crm/deals");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fcrm%2Fdeals$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("a wrong password shows the error and stays on sign-in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login\?error=/);
  await expect(page.getByText("Invalid login credentials")).toBeVisible();
});

test("signing in lands on the requested page; signing out locks the admin again", async ({ page }) => {
  await page.goto("/admin/crm/tasks");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/admin\/crm\/tasks$/);
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await expect(page.getByText(user.email)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "CRM" })).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/admin/social");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fsocial$/);
});

test("/admin opens the social manager, and the top nav switches sections", async ({ page }) => {
  const seed = readSeed();
  await page.goto("/login");
  await page.getByLabel("Email").fill(seed.email);
  await page.getByLabel("Password").fill(seed.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/social$/);
  await expect(page.getByText(seed.workspaceName)).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Admin" });
  await nav.getByRole("link", { name: "CRM" }).click();
  await expect(page.getByRole("heading", { name: "CRM overview" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "CRM" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Social" }).click();
  await expect(page.getByRole("heading", { name: "Content calendar" })).toBeVisible();
  // Leave this session alone: signing the shared admin out would revoke the suite's saved session.
});
