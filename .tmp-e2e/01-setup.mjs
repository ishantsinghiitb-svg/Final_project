import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = "http://localhost:8080";
const SHOT_DIR = path.resolve("./shots");
fs.mkdirSync(SHOT_DIR, { recursive: true });

const stamp = Date.now();
const EMAIL = `claudetest7c${stamp}@gmail.com`;
const PASSWORD = "TestPass123";
const FULL_NAME = "Priya Sharma";

function log(msg) {
  console.log(`[setup] ${new Date().toISOString().slice(11, 19)} ${msg}`);
}

async function shot(page, name) {
  const p = path.join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  log(`screenshot: ${p}`);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("favicon")) {
      log(`HTTP ${res.status()} ${res.url()}`);
    }
  });

  try {
    log(`signing up as ${EMAIL}`);
    await page.goto(`${BASE_URL}/signup`);
    await page.waitForSelector('input[placeholder="Ada Lovelace"]', { timeout: 15000 });
    await page.fill('input[placeholder="Ada Lovelace"]', FULL_NAME);
    await page.fill('input[type="email"]', EMAIL);
    const pwInputs = await page.locator('input[type="password"]').all();
    await pwInputs[0].fill(PASSWORD);
    await pwInputs[1].fill(PASSWORD);
    await shot(page, "01-signup-filled");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await shot(page, "02-after-signup-submit");

    const url = page.url();
    log(`post-signup URL: ${url}`);
    if (!url.includes("/dashboard")) {
      log("WARNING: not redirected to dashboard — email confirmation may be required.");
      const bodyText = await page.textContent("body");
      log(`body snippet: ${bodyText.slice(0, 300)}`);
      throw new Error("Signup did not produce an active session — check email confirmation setting.");
    }
    log("signup succeeded, session active");

    // ── Upload resume ──
    await page.goto(`${BASE_URL}/dashboard/resumes`);
    await page.waitForLoadState("networkidle");
    await shot(page, "03-resumes-page");
    const uploadBtn = page.locator('button:has-text("Upload resume")').first();
    await uploadBtn.click();
    await page.waitForTimeout(500);
    const fileInput = page.locator('input[type="file"]');
    const resumePath = path.resolve("./priya-sharma-resume.pdf");
    await fileInput.setInputFiles(resumePath);
    await shot(page, "04-resume-file-selected");
    // Try to find and click an explicit upload/confirm button if present.
    const dialogUploadBtn = page.locator('button:has-text("Upload")').last();
    if (await dialogUploadBtn.isVisible().catch(() => false)) {
      await dialogUploadBtn.click().catch(() => {});
    }
    await page.waitForTimeout(3000);
    await shot(page, "05-resume-uploaded");

    // Wait for parse to complete (deterministic, should be fast).
    let parsed = false;
    for (let i = 0; i < 20; i++) {
      const text = await page.textContent("body");
      if (/ready|Ready|Health|parsed/i.test(text) && !/Uploading|Processing|Parsing/i.test(text)) {
        parsed = true;
        break;
      }
      await page.waitForTimeout(1500);
    }
    log(`resume parse settled: ${parsed}`);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await shot(page, "06-resumes-after-parse");

    // ── Create a standalone interview ──
    await page.goto(`${BASE_URL}/dashboard/interviews`);
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("New Interview")');
    await page.waitForSelector("#interview-company", { timeout: 10000 });
    await page.fill("#interview-company", "Acme Cloud Systems");
    await page.fill("#interview-role", "Product Manager");
    await page.fill("#interview-round", "Hiring Manager");
    const dateInput = page.locator("#interview-date");
    if (await dateInput.count()) {
      const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      await dateInput.fill(future).catch(() => {});
    }
    const timeInput = page.locator("#interview-time");
    if (await timeInput.count()) {
      await timeInput.fill("10:00").catch(() => {});
    }
    await shot(page, "07-interview-dialog-basic");

    // Expand "More details" to link the resume now.
    await page.click('button:has-text("More details")');
    await page.waitForTimeout(300);
    const resumeSelect = page.locator("select").last();
    await resumeSelect.selectOption({ index: 1 }).catch(async () => {
      // fall back: pick the first non-empty option by label containing the resume name
      const options = await resumeSelect.locator("option").allTextContents();
      log(`resume select options: ${JSON.stringify(options)}`);
    });
    await shot(page, "08-interview-dialog-resume-linked");

    await page.click('button:has-text("Schedule Interview")');
    await page.waitForTimeout(2000);
    await shot(page, "09-interview-created");

    await page.waitForLoadState("networkidle");
    // Find the newly created interview's detail link.
    const link = page.locator('a[href*="/dashboard/interviews/"]').first();
    let interviewUrl = null;
    // Click the card for Acme Cloud Systems specifically.
    const acmeCard = page.locator('text=Acme Cloud Systems').first();
    if (await acmeCard.count()) {
      await acmeCard.click();
      await page.waitForLoadState("networkidle");
      interviewUrl = page.url();
    } else if (await link.count()) {
      await link.click();
      await page.waitForLoadState("networkidle");
      interviewUrl = page.url();
    }
    log(`interview detail URL: ${interviewUrl}`);
    await shot(page, "10-interview-detail");

    const match = interviewUrl && interviewUrl.match(/interviews\/([a-f0-9-]+)/);
    const interviewId = match ? match[1] : null;
    log(`interviewId: ${interviewId}`);

    if (!interviewId) throw new Error("Could not determine interviewId from URL");

    const storageStatePath = path.resolve("./storageState.json");
    await context.storageState({ path: storageStatePath });

    fs.writeFileSync(
      path.resolve("./state.json"),
      JSON.stringify({ email: EMAIL, password: PASSWORD, interviewId, storageStatePath }, null, 2),
    );
    log("SETUP COMPLETE — state.json written");
    log(`console errors captured so far: ${consoleErrors.length}`);
    if (consoleErrors.length) log(JSON.stringify(consoleErrors.slice(0, 20), null, 2));
  } catch (err) {
    log(`FATAL: ${err.stack || err.message}`);
    await shot(page, "ERROR-state");
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
