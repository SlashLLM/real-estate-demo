import { expect, type Locator, type Page } from "@playwright/test";

export const dialog = (page: Page, title: string) => page.getByRole("dialog", { name: title });

/** "YYYY-MM-DD" n days from now in the browser's timezone (for <input type="date">). */
export function isoDate(daysFromNow: number) {
  return new Date(Date.now() + daysFromNow * 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
}

/**
 * dnd-kit's pointer sensor needs a press, a move past its 6 px threshold, then small steps onto the target. A target
 * partly scrolled out of view is aimed at its visible edge (the card overlaps it most there).
 */
export async function dragTo(page: Page, item: Locator, target: Locator) {
  await item.scrollIntoViewIfNeeded();
  const from = (await item.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 });
  const to = (await target.boundingBox())!;
  const x = Math.min(to.x + to.width / 2, page.viewportSize()!.width - 24);
  await page.mouse.move(x, to.y + Math.min(to.height / 2, 120), { steps: 20 });
  await expect(target).toHaveClass(/border-primary/); // the column highlights while a card is over it
  await page.mouse.up();
}

/** A <Stat> tile: label, then value, then an optional hint. */
export async function expectStat(page: Page, label: string, value: string | RegExp, hint?: string | RegExp) {
  const tile = page.getByText(label, { exact: true }).locator("..");
  await expect(tile.locator("p").nth(1)).toHaveText(value);
  if (hint) await expect(tile.locator("p").nth(2)).toHaveText(hint);
}
