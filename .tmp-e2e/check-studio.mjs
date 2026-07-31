import { chromium } from "playwright";
import fs from "node:fs";

const state = JSON.parse(fs.readFileSync("./state.json", "utf8"));
const BASE_URL = "http://localhost:8080";
// Use the session that was already created in the last run's log.
const sessionUrl = process.argv[2];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: state.storageStatePath,
  });
  const page = await context.newPage();
  page.on("console", (m) => console.log("console:", m.type(), m.text()));
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  page.on("requestfailed", (r) => console.log("requestfailed:", r.url(), r.failure()?.errorText));
  page.on("response", (res) => {
    if (res.status() >= 400) console.log("HTTP", res.status(), res.url());
  });

  console.log("goto", sessionUrl);
  await page.goto(sessionUrl);
  await page.waitForTimeout(15000);
  await page.screenshot({ path: "./shots/check-studio-15s.png", fullPage: true });
  const html = await page.content();
  fs.writeFileSync("./studio-page-15s.html", html);
  console.log("dumped HTML, len:", html.length);

  await page.waitForTimeout(20000);
  await page.screenshot({ path: "./shots/check-studio-35s.png", fullPage: true });
  console.log("done waiting 35s total");

  await browser.close();
})();
