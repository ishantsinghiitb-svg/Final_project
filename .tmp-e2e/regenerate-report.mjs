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
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("console error:", m.text());
  });

  await page.goto(url);
  await page.waitForSelector('button:has-text("Regenerate report")', { timeout: 30000 });
  await page.click('button:has-text("Regenerate report")');
  console.log("clicked regenerate, waiting for real OpenAI report call...");
  await page.waitForTimeout(20000);
  await page.screenshot({ path: "./shots/regenerated-report.png", fullPage: true });

  const text = await page.textContent("body");
  fs.writeFileSync("./report-text-v2.txt", text);
  console.log("dumped to report-text-v2.txt");

  // Expand Competency Scores is already open by default; try clicking a Q chip.
  const qChip = page.locator("button", { hasText: /^Q\d+$/ }).first();
  if (await qChip.count()) {
    const label = await qChip.textContent();
    await qChip.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: "./shots/regenerated-citation-click.png", fullPage: true });
    console.log("clicked citation chip:", label);
  }

  await browser.close();
})();
