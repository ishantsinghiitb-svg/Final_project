import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const state = JSON.parse(fs.readFileSync("./state.json", "utf8"));
const url = process.argv[2];
const SHOT_DIR = path.resolve("./shots");

function log(msg) {
  console.log(`[end-report] ${new Date().toISOString().slice(11, 19)} ${msg}`);
}
let idx = 0;
async function shot(page, name) {
  idx += 1;
  const p = path.join(SHOT_DIR, `e${String(idx).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  log(`screenshot: ${p}`);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: state.storageStatePath,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("favicon")) log(`HTTP ${res.status()} ${res.url()}`);
  });

  try {
    await page.goto(url);
    // Might be paused from the last debug run — wait for whichever real state
    // actually renders (paused overlay or the live composer), then resume if needed.
    await Promise.race([
      page.waitForSelector("text=Interview paused", { timeout: 45000 }),
      page.waitForSelector('textarea[placeholder*="Type your answer"]', { timeout: 45000 }),
    ]);
    const pausedVisible = await page
      .locator("text=Interview paused")
      .isVisible()
      .catch(() => false);
    if (pausedVisible) {
      await page.getByRole("button", { name: "Resume interview" }).click();
      log("resumed from paused state");
    }
    await page.waitForSelector('textarea[placeholder*="Type your answer"]', { timeout: 30000 });
    await shot(page, "resumed-or-loaded");

    // Answer two more turns to get a richer transcript before ending.
    const moreAnswers = [
      "I used Amplitude to set up the A/B test — we split new signups 50/50 between the old and new referral flow using a random assignment at the session level, and tracked signup completion as the primary metric with a two-week minimum runtime to reach significance.",
      "Looking back, the one thing I'd do differently is loop in the data science team earlier to validate our sample size calculation — we got lucky that two weeks was enough, but I was estimating that duration myself rather than confirming it statistically upfront.",
    ];

    for (const answer of moreAnswers) {
      const textarea = page.locator('textarea[placeholder*="Type your answer"]');
      await textarea.waitFor({ state: "visible", timeout: 45000 });
      const isDisabled = await textarea.isDisabled();
      if (isDisabled) {
        log("textarea disabled, waiting a bit more");
        await page.waitForTimeout(3000);
      }
      await textarea.fill(answer);
      await page.getByRole("button", { name: "Send answer" }).click();
      log("submitted an extra answer, waiting for next turn");
      await page.waitForFunction(
        () => {
          const ta = document.querySelector('textarea[placeholder*="Type your answer"]');
          return ta && !ta.disabled && ta.value === "";
        },
        { timeout: 45000 },
      );
    }
    await shot(page, "before-end");

    const questionBeforeEnd = await page.locator("p.font-display").first().textContent();
    log(`question right before ending: ${questionBeforeEnd?.slice(0, 200)}`);

    // ── End the interview ──
    await page.getByRole("button", { name: "End", exact: true }).click();
    await page.waitForTimeout(500);
    await shot(page, "end-dialog");
    await page.getByRole("button", { name: "End interview" }).click();
    log("confirmed end — waiting for report (real OpenAI call)");

    await page.waitForTimeout(1500);
    await shot(page, "concluding");

    await page.waitForURL(/\/report$/, { timeout: 90000 });
    log(`navigated to report: ${page.url()}`);
    await page.waitForTimeout(1500);
    await shot(page, "report-page");

    const reportText = await page.textContent("body");
    fs.writeFileSync(path.resolve("./report-text.txt"), reportText);
    log(`report text length: ${reportText.length}, dumped to report-text.txt`);

    // Click a citation and confirm it scrolls to the real transcript entry.
    const citeBtn = page.locator('button:has-text("Question ")').first();
    if (await citeBtn.count()) {
      const citeLabel = await citeBtn.textContent();
      await citeBtn.click();
      await page.waitForTimeout(800);
      await shot(page, "citation-clicked");
      log(`clicked citation: ${citeLabel}`);
    } else {
      log("WARNING: no citation buttons found on report");
    }

    log(`DONE. console errors: ${consoleErrors.length}`);
    if (consoleErrors.length) log(JSON.stringify(consoleErrors, null, 2));
  } catch (err) {
    log(`FATAL: ${err.stack || err.message}`);
    await shot(page, "ERROR");
  } finally {
    await browser.close();
  }
})();
