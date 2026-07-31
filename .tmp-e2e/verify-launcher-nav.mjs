import { chromium } from "playwright";
import fs from "node:fs";

const state = JSON.parse(fs.readFileSync("./state.json", "utf8"));
const BASE_URL = "http://localhost:8080";

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: state.storageStatePath,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("console error:", m.text());
  });

  console.log("A) via UI click from detail page:");
  await page.goto(`${BASE_URL}/dashboard/interviews/${state.interviewId}`);
  await page.waitForLoadState("networkidle");
  await page.click('button:has-text("Start Mock Interview")');
  await page.waitForTimeout(1500);
  console.log("URL after click:", page.url());
  await page.screenshot({ path: "./shots/verify-launcher-via-click.png", fullPage: true });

  console.log("B) via raw goto WITH trailing slash:");
  await page.goto(`${BASE_URL}/dashboard/interviews/${state.interviewId}/mock/`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  console.log("URL:", page.url());
  await page.screenshot({ path: "./shots/verify-launcher-trailing-slash.png", fullPage: true });

  await browser.close();
})();
