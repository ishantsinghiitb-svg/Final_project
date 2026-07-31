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

  await page.goto(`${BASE_URL}/dashboard/interviews/${state.interviewId}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "./shots/verify-detail.png", fullPage: true });
  console.log("URL:", page.url());
  await browser.close();
})();
