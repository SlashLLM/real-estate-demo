import { expect, test as setup } from "@playwright/test";
import { STORAGE_STATE } from "./support/constants";
import { readSeed } from "./support/db";

setup("sign in as the test admin", async ({ page }) => {
  const seed = readSeed();
  await page.goto("/login");
  await page.getByLabel("Email").fill(seed.email);
  await page.getByLabel("Password").fill(seed.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/social$/);
  await expect(page.getByRole("heading", { name: "Content calendar" })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
