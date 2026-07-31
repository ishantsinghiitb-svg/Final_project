import { chromium } from "playwright";
import fs from "node:fs";

const state = JSON.parse(fs.readFileSync("./state.json", "utf8"));
const BASE_URL = "http://localhost:8080";

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', state.email);
  await page.fill('input[type="password"]', state.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  console.log("logged in on", BASE_URL, "as", state.email);

  await context.storageState({ path: state.storageStatePath });
  console.log("storageState re-saved for the new origin");

  await browser.close();
})();
