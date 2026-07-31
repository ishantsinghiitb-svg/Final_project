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
  page.on("console", (m) => {
    if (m.type() === "error") console.log("console error:", m.text());
  });
  page.on("pageerror", (e) => console.log("pageerror:", e.message));

  await page.goto(url);
  await page.waitForSelector("text=Interview paused", { timeout: 30000 });
  console.log("confirmed still paused on fresh load (persistence across refresh)");
  await page.screenshot({ path: "./shots/debug-still-paused-after-reload.png", fullPage: true });

  await page.getByRole("button", { name: "Resume interview" }).click();
  await page.waitForSelector('textarea[placeholder*="Type your answer"]', { timeout: 15000 });
  console.log("resumed — question composer visible again");
  const text = await page.locator("p.font-display").first().textContent();
  console.log("question after resume:", text);
  await page.screenshot({ path: "./shots/debug-resumed.png", fullPage: true });

  // Edge case: click Pause again while already active, then click it a
  // second time quickly to check for a double-pause error surface.
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForSelector("text=Interview paused", { timeout: 15000 });
  console.log("re-paused OK");

  await browser.close();
})();
