import { expect, test, type Locator, type Page } from "@playwright/test";
import { readSeed } from "./support/db";
import { dialog, dragTo, expectStat, isoDate } from "./support/ui";

// One story through the CRM in a fresh workspace: later steps build on earlier ones (and the dashboard totals them).
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const contact = {
  first: "Aisha",
  last: `Tan ${run}`,
  email: `aisha.${run}@example.com`,
  phone: "+65 9123 4567",
  company: `Tan Family Office ${run}`,
};
const contactName = `${contact.first} ${contact.last}`;
const lead = { first: `Marcus ${run}`, email: `marcus.${run}@example.com` };
const dealOpen = `Tampines 4-room resale ${run}`;
const dealWon = `Bishan condo listing ${run}`;

const column = (page: Page, stage: string) => page.getByRole("region", { name: stage, exact: true });
const card = (col: Locator, title: string) => col.locator("article", { hasText: title });

test("create a contact (with a new company) from the contacts list", async ({ page }) => {
  await page.goto("/admin/crm/contacts");
  await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
  await expect(page.getByText("No contacts yet")).toBeVisible();

  await page.getByRole("button", { name: "New contact" }).click();
  const form = dialog(page, "New contact");
  await form.getByLabel("First name").fill(contact.first);
  await form.getByLabel("Last name").fill(contact.last);
  await form.getByLabel("Email").fill(contact.email);
  await form.getByLabel("Phone").fill(contact.phone);
  await form.getByLabel("Job title").fill("Owner");
  await form.getByLabel("Company").fill(contact.company);
  await form.getByLabel("Lifecycle stage").selectOption("lead");
  await form.getByRole("button", { name: "Create contact" }).click();
  await expect(form).toBeHidden();

  const row = page.getByRole("row", { name: new RegExp(contactName) });
  await expect(row).toBeVisible();
  await expect(row).toContainText(contact.email);
  await expect(row).toContainText(contact.company);
  await expect(row).toContainText("LEAD");
  await expect(row).toContainText("manual");
});

test("validation errors from the server are shown in the form", async ({ page }) => {
  await page.goto("/admin/crm/contacts");
  await page.getByRole("button", { name: "New contact" }).click();
  const form = dialog(page, "New contact");
  await form.getByLabel("First name").fill("Duplicate");
  await form.getByLabel("Email").fill(contact.email.toUpperCase()); // emails are unique per workspace, case-insensitively
  await form.getByRole("button", { name: "Create contact" }).click();
  await expect(form.locator("p.text-danger")).toContainText(/duplicate|unique/i);
  await form.getByRole("button", { name: "Close" }).click();
  await expect(form).toBeHidden();
});

test("search and stage filters narrow the contact list via the URL", async ({ page }) => {
  await page.goto("/admin/crm/contacts");
  const search = page.getByPlaceholder("Search name, email, phone…");

  await search.fill(contact.last);
  await search.press("Enter");
  await expect(page).toHaveURL(new RegExp(`q=Tan\\+${run}`));
  await expect(page.getByRole("row", { name: new RegExp(contactName) })).toBeVisible();

  await search.fill(`nobody-${run}`);
  await search.press("Enter");
  await expect(page.getByText("No contacts yet")).toBeVisible();

  await page.goto("/admin/crm/contacts?stage=customer");
  await expect(page.getByText("No contacts yet")).toBeVisible();
  await page.getByRole("combobox").selectOption("lead");
  await expect(page).toHaveURL(/stage=lead/);
  await expect(page.getByRole("row", { name: new RegExp(contactName) })).toBeVisible();
});

test("contact detail: edit, log an activity, add and complete a task", async ({ page }) => {
  await page.goto("/admin/crm/contacts");
  await page.getByRole("row", { name: new RegExp(contactName) }).click();
  await expect(page).toHaveURL(/\/admin\/crm\/contacts\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: contactName })).toBeVisible();
  // The Contacts tab stays highlighted on detail pages.
  await expect(page.getByRole("navigation", { name: "CRM" }).getByRole("link", { name: "Contacts" })).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: "Edit" }).click();
  const form = dialog(page, "Edit contact");
  await expect(form.getByLabel("Company")).toHaveValue(contact.company);
  await form.getByLabel("Job title").fill("Homeowner, selling in Q1");
  await form.getByLabel("Lifecycle stage").selectOption("opportunity");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(form).toBeHidden();
  await expect(page.getByText("Homeowner, selling in Q1")).toBeVisible();
  await expect(page.getByText("OPPORTUNITY", { exact: true })).toBeVisible();

  await page.locator("select[name=type]").selectOption("call");
  await page.getByPlaceholder("Subject").fill(`Valuation call ${run}`);
  await page.getByPlaceholder("What happened?").fill("Discussed asking price and MOP timing.");
  await page.getByRole("button", { name: "Log activity" }).click();
  const entry = page.getByRole("listitem").filter({ hasText: `Valuation call ${run}` });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText("Discussed asking price and MOP timing.");
  await expect(entry).toContainText("📞");

  const task = `Send comparables to Aisha ${run}`;
  await page.getByPlaceholder("New task").fill(task);
  await page.locator("input[name=due_at]").fill(isoDate(2));
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const box = page.getByRole("checkbox", { name: new RegExp(task) });
  await expect(box).not.toBeChecked();
  await box.click(); // controlled by server state: it flips once the action revalidates
  await expect(box).toBeChecked();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: new RegExp(task) })).toBeChecked();
});

test("companies: the company typed on the contact exists, and new ones can be added", async ({ page }) => {
  await page.goto("/admin/crm/companies");
  const existing = page.getByRole("row", { name: new RegExp(contact.company) });
  await expect(existing).toBeVisible();
  await expect(existing.getByRole("cell").last()).toHaveText("1");

  const name = `Lim Realty ${run}`;
  await page.getByRole("button", { name: "New company" }).click();
  const form = dialog(page, "New company");
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Domain").fill("limrealty.example.com");
  await form.getByLabel("Industry").fill("Real estate");
  await form.getByLabel("Size").fill("11-50");
  await form.getByRole("button", { name: "Create" }).click();
  await expect(form).toBeHidden();
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText("limrealty.example.com");
  await expect(row).toContainText("Real estate");
  await expect(row.getByRole("cell").last()).toHaveText("0");
});

test("deals: create deals and move them through the pipeline", async ({ page }) => {
  await page.goto("/admin/crm/deals");
  await expect(page.getByRole("heading", { name: "Deals · Sales" })).toBeVisible();
  for (const stage of ["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]) await expect(column(page, stage)).toBeVisible();
  // Closed stages take no new deals.
  await expect(page.getByRole("button", { name: "Add deal to Won" })).toHaveCount(0);

  for (const [title, amount] of [
    [dealOpen, "450000"],
    [dealWon, "120000"],
  ]) {
    await page.getByRole("button", { name: "Add deal to New" }).click();
    const form = dialog(page, "New deal");
    await form.getByLabel("Title").fill(title);
    await form.getByLabel("Amount").fill(amount);
    await form.getByLabel("Contact").selectOption({ label: contactName });
    await form.getByLabel("Expected close").fill(isoDate(30));
    await form.getByRole("button", { name: "Create deal" }).click();
    await expect(form).toBeHidden();
    await expect(card(column(page, "New"), title)).toBeVisible();
  }
  await expect(column(page, "New")).toContainText("2 · $570,000");

  await dragTo(page, card(column(page, "New"), dealOpen), column(page, "Qualified"));
  await expect(card(column(page, "Qualified"), dealOpen)).toBeVisible();
  // Won is mostly scrolled out of view on the board; the drop closes the deal.
  await dragTo(page, card(column(page, "New"), dealWon), column(page, "Won"));
  await expect(card(column(page, "Won"), dealWon)).toContainText("won");

  await page.reload();
  await expect(card(column(page, "Qualified"), dealOpen)).toBeVisible();
  await expect(card(column(page, "Won"), dealWon)).toBeVisible();
  await expect(column(page, "New")).toContainText("0 · $0");

  // Deals show on the contact they belong to.
  await page.goto("/admin/crm/contacts");
  await page.getByRole("row", { name: new RegExp(contactName) }).click();
  await expect(page.getByText(dealOpen)).toBeVisible();
  await expect(page.getByText(dealWon)).toBeVisible();
});

test("tasks: add, close and reopen", async ({ page }) => {
  const task = `Call back Mr Lim about Bishan ${run}`;
  await page.goto("/admin/crm/tasks");
  const tabs = page.getByRole("tablist", { name: "Task status" });
  await expect(tabs.getByRole("tab", { name: /Open/ })).toHaveAttribute("aria-selected", "true");

  await page.getByPlaceholder("What needs doing?").fill(task);
  await page.locator("input[name=due_at]").fill(isoDate(1));
  await page.getByRole("button", { name: "Add task" }).click();
  const box = page.getByRole("checkbox", { name: new RegExp(task) });
  await expect(box).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /Open/ })).toContainText("1");

  await box.click(); // controlled by server state: it flips once the action revalidates
  await expect(box).toBeHidden();
  await expect(tabs.getByRole("tab", { name: /Open/ })).toContainText("0");

  await tabs.getByRole("tab", { name: /Closed/ }).click();
  await expect(page).toHaveURL(/status=closed/);
  // The task completed on the contact page is closed too.
  await expect(tabs.getByRole("tab", { name: /Closed/ })).toContainText("2");
  const closed = page.getByRole("checkbox", { name: new RegExp(task) });
  await expect(closed).toBeChecked();
  await closed.click();
  await expect(closed).toBeHidden();

  await tabs.getByRole("tab", { name: /Open/ }).click();
  await expect(page.getByRole("checkbox", { name: new RegExp(task) })).not.toBeChecked();
});

test("a lead submitted on the public website appears in the CRM with its source", async ({ page, request }) => {
  const { formId } = readSeed();
  const res = await request.post(`/api/crm/forms/${formId}/submit`, {
    data: {
      first_name: lead.first,
      email: lead.email,
      phone: "+65 8000 1234",
      message: "What is my Punggol flat worth?",
      _cta: "home-hero-valuation",
      _page: "http://localhost:3100/?cta=home-hero-valuation",
    },
  });
  expect(res.ok(), await res.text()).toBe(true);

  await page.goto("/admin/crm/contacts");
  const row = page.getByRole("row", { name: new RegExp(lead.first) });
  await expect(row).toContainText(lead.email);
  await expect(row).toContainText("website_cta:home-hero-valuation");
  await row.click();
  await expect(page.getByText('Submitted "Website contact form" via CTA "home-hero-valuation"')).toBeVisible();
  // Extra form fields are kept on the contact and in the submission activity.
  await expect(page.getByRole("definition").filter({ hasText: "What is my Punggol flat worth?" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "What is my Punggol flat worth?" })).toBeVisible();
});

test("the public form rejects a submission missing required fields", async ({ request }) => {
  const res = await request.post(`/api/crm/forms/${readSeed().formId}/submit`, { data: { first_name: "No email" } });
  expect(res.ok()).toBe(false);
});

test("the CRM overview totals pipeline, wins, contacts and lead sources", async ({ page }) => {
  await page.goto("/admin/crm");
  await expect(page.getByRole("heading", { name: "CRM overview" })).toBeVisible();
  await expectStat(page, "Open pipeline", "$450,000", "$112,500 weighted"); // Qualified = 25%
  await expectStat(page, "Won (30 days)", "$120,000");
  await expectStat(page, "Win rate (30 days)", "100%");
  await expectStat(page, "New contacts (30 days)", "2", "1 open tasks"); // the reopened task

  const sources = page.locator("div", { has: page.getByRole("heading", { name: "Lead sources (30 days)" }) }).last();
  await expect(sources).toContainText("Home page");
  await expect(sources).toContainText("home-hero-valuation");
  await expect(sources).toContainText("manual");
});
