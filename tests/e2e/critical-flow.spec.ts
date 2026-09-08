import { test, expect } from "@playwright/test";

/**
 * Critical workflow (requires a seeded database and the dev server running):
 *   client logs in → creates a ticket → agent sees it and replies →
 *   client sees the reply → agent resolves → client sees the resolution.
 *
 * Run with:  npm run dev   (in one terminal)
 *            npm run test:e2e
 */

const CLIENT = { email: "sarah@abc-manufacturing.example.com", password: "Passw0rd!2026" };
const AGENT = { email: "agent@corecrm.dev", password: "Passw0rd!2026" };

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(admin|portal)/);
}

test("client raises a ticket and an agent responds", async ({ browser }) => {
  const subject = `Playwright test ${Date.now()}`;

  // --- Client creates a ticket ---
  const clientCtx = await browser.newContext();
  const clientPage = await clientCtx.newPage();
  await login(clientPage, CLIENT.email, CLIENT.password);

  await clientPage.goto("/portal/tickets/new");
  await clientPage.getByLabel("Subject").fill(subject);
  await clientPage
    .getByLabel("Description")
    .fill("Automated end-to-end test description with enough detail.");
  await clientPage.getByRole("button", { name: /submit ticket/i }).click();
  await clientPage.waitForURL(/\/portal\/tickets\/[0-9a-f-]+/);
  const ticketUrl = clientPage.url();
  await expect(clientPage.getByText(subject)).toBeVisible();

  // --- Agent finds it and replies ---
  const agentCtx = await browser.newContext();
  const agentPage = await agentCtx.newPage();
  await login(agentPage, AGENT.email, AGENT.password);
  await agentPage.goto("/admin/tickets");
  await agentPage.getByPlaceholder(/search/i).fill(subject);
  await agentPage.getByRole("link", { name: subject }).first().click();
  await agentPage.getByPlaceholder(/write a reply/i).fill("We're looking into it now.");
  await agentPage.getByRole("button", { name: /send reply/i }).click();
  await expect(agentPage.getByText("We're looking into it now.")).toBeVisible();

  // --- Agent resolves ---
  await agentPage.getByRole("combobox").first().click();
  await agentPage.getByRole("option", { name: "Resolved" }).click();

  // --- Client sees the reply and the resolution ---
  await clientPage.goto(ticketUrl);
  await expect(clientPage.getByText("We're looking into it now.")).toBeVisible();
  await expect(clientPage.getByText("Resolved").first()).toBeVisible();

  await clientCtx.close();
  await agentCtx.close();
});
