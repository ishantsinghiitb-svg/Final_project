import { chromium } from "playwright";
import fs from "node:fs";

const state = JSON.parse(fs.readFileSync("./state.json", "utf8"));
const BASE_URL = "http://localhost:8080";

function log(msg) {
  console.log(`[second] ${new Date().toISOString().slice(11, 19)} ${msg}`);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: state.storageStatePath,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") log(`console error: ${m.text()}`);
  });

  await page.goto(`${BASE_URL}/dashboard/interviews/${state.interviewId}`);
  await page.waitForLoadState("networkidle");
  await page.click('button:has-text("Open Mock Interview"), button:has-text("Start Mock Interview")');
  await page.waitForSelector("text=Who is interviewing you?", { timeout: 45000 });

  const jd = page.locator("#mock-jd");
  if (await jd.count()) await jd.fill("We are hiring a Senior Product Manager for a growth team.");

  const startTrigger = page.locator('button:has-text("Start Mock Interview")').first();
  await startTrigger.click();
  await page.waitForTimeout(500);

  const bodyText = await page.textContent("body");
  const m = bodyText.match(/You have\s+(\d+)\s+AI Credit/);
  log(`credits remaining before second start: ${m ? m[1] : "not found"}`);
  await page.screenshot({ path: "./shots/second-start-dialog-topped-up.png", fullPage: true });

  const confirmBtn = page.getByRole("button", { name: "Start Mock Interview", exact: true });
  await confirmBtn.click();
  log("confirmed — waiting for real OpenAI planning call");
  await page.waitForURL(/\/mock\/[a-f0-9-]+$/, { timeout: 60000 });
  log(`second session started: ${page.url()}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "./shots/second-session-studio.png", fullPage: true });

  await browser.close();
})();
