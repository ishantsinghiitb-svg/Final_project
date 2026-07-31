import { chromium } from "playwright";
import fs from "node:fs";

const state = JSON.parse(fs.readFileSync("./state.json", "utf8"));
const url = process.argv[2];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: state.storageStatePath,
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForSelector('textarea[placeholder*="Type your answer"]', { timeout: 60000 });
  await page.waitForTimeout(1000);
  const text = await page.locator("p.font-display").first().textContent();
  console.log("question text after fresh load:", text);
  await page.screenshot({ path: "./shots/check-refresh.png", fullPage: true });
  await browser.close();
})();
