import { expect, test, type Browser, type Page } from "@playwright/test";
import { startSyntheticSite, type SyntheticSite } from "../scripts/synthetic-site";
import { demoPassword } from "../src/lib/fixtures";
import { startSmtpInbox } from "./support/smtpInbox";

let site: SyntheticSite;
let inbox: Awaited<ReturnType<typeof startSmtpInbox>>;

test.beforeAll(async () => {
  const production = process.env.RAAST_E2E_PRODUCTION === "1";
  inbox = await startSmtpInbox();
  site = await startSyntheticSite(production ? ".next" : ".next-smoke", production, {
    RAAST_LOCAL_MAIL_PORT: String(inbox.port), RAAST_ALLOW_PERSONAL_SIGNUP: "true", GMAIL_USER: "", GMAIL_APP_PASSWORD: "",
  });
});
test.afterAll(async () => {
  try { await site?.stop(); } finally { await inbox?.stop(); }
});
test.afterEach(async ({ browserName }, info) => {
  if (info.status !== info.expectedStatus && site) {
    await info.attach(`local-server-log-${browserName}`, { body: site.logs(), contentType: "text/plain" });
  }
});

async function signIn(page: Page, role: string, destination: string) {
  await page.goto(`${site.url}/login`);
  await page.getByRole("button", { name: role, exact: true }).click();
  await page.getByLabel("Email address").fill(`${role.toLowerCase()}@demo.pk`);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`**/${destination}`, { timeout: 45000 });
}

test("citizen signup sends a welcome email and signs in with manually entered credentials", async ({ page }) => {
  const email = "new.citizen@example.net";
  const password = "CitizenTest2026!";
  await page.goto(`${site.url}/login`);
  await page.getByRole("link", { name: "Create a citizen account" }).click();
  await page.waitForURL("**/signup");
  await page.getByLabel("Email address").fill("New.Citizen@example.net");
  await page.getByLabel("Password").fill(password);
  const submitted = page.waitForResponse((response) => response.url().endsWith("/api/auth/signup") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  expect((await submitted).status()).toBe(201);
  await expect(page.getByText("Account created. Check your inbox for a welcome email.")).toBeVisible();
  expect(inbox.messages).toEqual([{
    recipient: `<${email}>`,
    content: expect.stringContaining("Subject: Welcome to RaastSahulat"),
  }]);
  expect(inbox.messages[0].content).not.toContain(password);

  const duplicate = await page.request.post(`${site.url}/api/auth/signup`, { data: { email, password } });
  expect(duplicate.status()).toBe(409);
  const staffSignup = await page.request.post(`${site.url}/api/auth/signup`, {
    data: { email: "new.admin@example.net", password, role: "ADMIN" },
  });
  expect(staffSignup.status()).toBe(400);
  expect(inbox.messages).toHaveLength(1);

  await page.getByRole("link", { name: "Go to sign in" }).click();
  await page.waitForURL("**/login");
  await page.getByRole("button", { name: "Citizen", exact: true }).click();
  await expect(page.getByLabel("Email address")).toHaveValue("");
  await expect(page.getByLabel("Password")).toHaveValue("");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Helper", exact: true }).click();
  await expect(page.getByLabel("Email address")).toHaveValue(email);
  await expect(page.getByLabel("Password")).toHaveValue(password);
  await page.getByRole("button", { name: "Citizen", exact: true }).click();
  const loginGate = Promise.withResolvers<void>();
  const casesGate = Promise.withResolvers<void>();
  await page.route("**/api/auth/callback/credentials", async (route) => {
    await loginGate.promise;
    await route.continue();
  });
  await page.route("**/api/cases", async (route) => {
    await casesGate.promise;
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("button", { name: "Signing in…" })).toBeVisible();
    loginGate.resolve();
    await page.waitForURL("**/portal");
    await expect(page.getByRole("heading", { name: "Your relief portal" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Loading applications…" })).toBeVisible();
    casesGate.resolve();
    await expect(page.getByText("Your submitted applications will appear here.")).toBeVisible();
  } finally {
    loginGate.resolve();
    casesGate.resolve();
  }

  await page.getByRole("navigation").getByRole("button", { name: "Data & consent" }).click();
  for (const scope of ["Identity verification", "Eligibility registry"]) {
    const consent = page.locator(".list-item").filter({ hasText: scope });
    await consent.getByRole("button", { name: "Grant access" }).click();
    await expect(consent.getByText("Active", { exact: true })).toBeVisible();
  }
  await page.getByRole("navigation").getByRole("button", { name: "Apply for relief" }).click();
  await expect(page.getByLabel("Synthetic name")).toHaveValue("Demo Citizen");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("heading", { name: "Application received" })).toBeVisible();
});

function trackErrors(page: Page, errors: string[]) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat|minified react error|did not match/i.test(message.text())) {
      errors.push(message.text());
    }
  });
}

async function rolePage(browser: Browser, width: number, role: string, route: string, errors: string[]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  try {
    const page = await context.newPage();
    trackErrors(page, errors);
    await signIn(page, role, route);
    return { context, page };
  } catch (error) {
    await context.close();
    throw error;
  }
}

test("citizen claim, officer payout, consent withdrawal, and auditor trace", async ({ browser }) => {
  const errors: string[] = [];
  const citizen = await rolePage(browser, 375, "Citizen", "portal", errors);
  let officer: Awaited<ReturnType<typeof rolePage>> | undefined;
  let auditor: Awaited<ReturnType<typeof rolePage>> | undefined;
  try {
    const { page } = citizen;
    await expect(page.getByText("Prototype", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Switch to Urdu" }).click();
    await expect(page.getByRole("heading", { name: "آپ کا امدادی پورٹل" })).toBeVisible();
    await page.getByRole("button", { name: "Switch to English" }).click();
    await page.getByRole("navigation").getByRole("button", { name: "Apply for relief" }).click();
    await citizen.context.setOffline(true);
    await page.getByLabel("Requested amount (PKR)").fill("9000");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Sample scan condition").selectOption("BLURRY");
    await expect(page.getByRole("button", { name: "Submit application" })).toBeDisabled();
    await citizen.context.setOffline(false);
    await page.reload();
    await page.getByRole("navigation").getByRole("button", { name: "Apply for relief" }).click();
    await expect(page.getByLabel("Sample scan condition")).toHaveValue("BLURRY");
    await page.getByRole("button", { name: "Preview sample" }).click();
    const uploaded = page.getByAltText("Synthetic document preview");
    await expect(uploaded).toBeVisible();
    const image = (await uploaded.getAttribute("src"))?.split(",")[1];
    expect(image).toBeTruthy();
    await page.getByLabel("Upload a synthetic document").setInputFiles({ name: "synthetic-blur.png", mimeType: "image/png", buffer: Buffer.from(image!, "base64") });
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByText("Human review", { exact: true })).toBeVisible();
    await expect(page.getByText("I am not sure the document is clear.", { exact: false })).toBeVisible();
    await page.evaluate(`Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          cancel() {},
          speak(message) { document.documentElement.dataset.spoken = message.text; },
        },
      })`);
    await page.getByRole("button", { name: "Listen", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-spoken", /I am not sure/);
    const caseNumber = await page.getByText(/^RS-\d{4}-[A-Z0-9-]+$/).textContent();
    expect(caseNumber).toBeTruthy();

    await page.getByRole("navigation").getByRole("button", { name: "Scam Shield" }).click();
    await page.getByRole("button", { name: "Load demo SMS" }).click();
    await page.getByRole("button", { name: "Check message" }).click();
    await expect(page.getByText("Likely scam", { exact: true })).toBeVisible();

    officer = await rolePage(browser, 1280, "Officer", "officer", errors);
    const inspect = officer.page.getByRole("button", { name: `Inspect ${caseNumber}` });
    await expect(inspect).toBeVisible();
    const refreshGate = Promise.withResolvers<void>();
    await officer.page.route("**/api/cases", async (route) => {
      await refreshGate.promise;
      await route.continue();
    });
    try {
      await officer.page.getByRole("button", { name: "Refresh queue" }).click();
      await expect(officer.page.getByRole("status").filter({ hasText: "Updating queue…" })).toBeVisible();
      await expect(inspect).toBeVisible();
      refreshGate.resolve();
      await expect(officer.page.getByRole("status").filter({ hasText: "Updating queue…" })).toBeHidden();
    } finally {
      refreshGate.resolve();
    }
    await inspect.click();
    await officer.page.getByLabel("Review notes").fill("Verified the synthetic identity evidence during human review.");
    await officer.page.getByRole("button", { name: "Record decision" }).click();
    await expect(officer.page.getByText("Decision recorded and mock payment sent.")).toBeVisible();
    await expect(officer.page.getByText(`MOCK-${caseNumber}`)).toBeVisible();
    await officer.page.getByRole("button", { name: "Close case" }).click();
    await expect(officer.page.getByText("Case closed.")).toBeVisible();

    await page.getByRole("navigation").getByRole("button", { name: "Data & consent" }).click();
    const identity = page.locator(".list-item").filter({ hasText: "Identity verification" });
    await identity.getByRole("button", { name: "Withdraw access now" }).click();
    await expect(identity.getByText("Withdrawn")).toBeVisible();

    auditor = await rolePage(browser, 1280, "Auditor", "auditor", errors);
    await auditor.page.getByLabel("Search entries").fill("Consent revoked");
    await expect(auditor.page.getByText("Consent revoked", { exact: false })).toBeVisible();
    await auditor.page.getByRole("navigation").getByRole("button", { name: "Decision traces" }).click();
    await auditor.page.getByRole("button", { name: `Inspect trace ${caseNumber}` }).click();
    await expect(auditor.page.getByText(/raastsahulat-deterministic-v1/)).toBeVisible();
    await auditor.page.getByRole("navigation").getByRole("button", { name: "Evaluation" }).click();
    await expect(auditor.page.getByText("Scam precision")).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([citizen.context.close(), officer?.context.close(), auditor?.context.close()]);
  }
});

test("helper switches families and syncs an IndexedDB outbox after reconnecting", async ({ browser }) => {
  const errors: string[] = [];
  const { page, context } = await rolePage(browser, 375, "Helper", "helper", errors);
  try {
    for (const household of ["02", "04"]) {
      await page.getByRole("button", { name: `Unlock Synthetic household ${household}` }).click();
      await page.getByLabel("Four-digit PIN").fill("1234");
      await page.getByLabel("Demo consent code").fill("246810");
      await page.getByRole("button", { name: "Confirm unlock" }).click();
      await expect(page.getByRole("heading", { name: "Create relief application" })).toBeVisible();
    }
    await context.setOffline(true);
    await page.getByRole("button", { name: "Save offline application" }).click();
    await expect(page.getByText("Application saved in the offline outbox.")).toBeVisible();
    await page.getByRole("navigation").getByRole("button", { name: "Offline outbox" }).click();
    await expect(page.getByRole("main").getByText("Synthetic household 04", { exact: true })).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText("1 saved application synced.")).toBeVisible();
    await expect(page.getByText("The outbox is empty.")).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test("admin simulates and publishes a new rule and runs an authenticated API request", async ({ browser }) => {
  const errors: string[] = [];
  const { page, context } = await rolePage(browser, 1280, "Admin", "admin", errors);
  try {
    await page.getByLabel("Maximum payout (PKR)").fill("12000");
    await page.getByRole("button", { name: "Run Digital Twin simulation" }).click();
    await expect(page.getByRole("heading", { name: "Digital Twin impact" })).toBeVisible();
    await page.getByLabel("Change note").fill("Published through the browser smoke test");
    await page.getByRole("button", { name: "Publish live rule v2" }).click();
    await expect(page.getByText("Policy v2 is live.")).toBeVisible();
    await page.goto(`${site.url}/api-docs`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByRole("heading", { name: "Response · HTTP 200" })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
