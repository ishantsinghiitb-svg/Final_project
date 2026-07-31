import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = "http://localhost:8080";
const SHOT_DIR = path.resolve("./shots");
fs.mkdirSync(SHOT_DIR, { recursive: true });

const state = JSON.parse(fs.readFileSync("./state.json", "utf8"));

const JOB_DESCRIPTION = `
We are hiring a Product Manager to own our growth and activation surface area.

Responsibilities:
- Own the signup and activation funnel for our consumer fintech product (2M+ MAU).
- Partner with engineering and design to ship experiments that improve activation and retention.
- Define and track North Star metrics; run weekly prioritization with engineering leads.
- Lead cross-functional projects end to end, from PRD through launch and post-launch analysis.
- Present roadmap and results to leadership monthly.

Requirements:
- 3+ years of product management experience, ideally in consumer fintech or high-growth consumer apps.
- Strong analytical skills; comfortable with SQL and product analytics tools (Amplitude, Mixpanel).
- Experience running A/B tests and translating results into product decisions.
- Track record of leading cross-functional teams without direct authority.
- Bachelor's degree in a technical field preferred.
`.trim();

function log(msg) {
  console.log(`[flow] ${new Date().toISOString().slice(11, 19)} ${msg}`);
}

let shotIndex = 0;
async function shot(page, name) {
  shotIndex += 1;
  const p = path.join(SHOT_DIR, `f${String(shotIndex).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch((e) => log(`screenshot failed: ${e.message}`));
  log(`screenshot: ${p}`);
}

async function creditsRemainingFromDialog(page) {
  const text = await page.textContent("body");
  const m = text.match(/You have\s+(\d+)\s+AI Credit/);
  return m ? Number(m[1]) : null;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: state.storageStatePath,
  });
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

  const report = { steps: [], consoleErrors };

  try {
    // ── Launcher ── navigate via the interview detail page's own button (the
    // real user path) rather than a raw goto — a cold first hard-navigation
    // straight to a nested route hits Vite's on-demand SSR compile and can be
    // slow; going through the app's own link warms things up realistically.
    log("navigating to interview detail page first");
    await page.goto(`${BASE_URL}/dashboard/interviews/${state.interviewId}`);
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Start Mock Interview")');
    log("clicked Start Mock Interview from detail page — waiting for launcher");
    await page.waitForSelector("text=Who is interviewing you?", { timeout: 45000 });
    await shot(page, "launcher-initial");

    const jdTextarea = page.locator("#mock-jd");
    if (await jdTextarea.count()) {
      await jdTextarea.fill(JOB_DESCRIPTION);
      log("filled manual job description");
    } else {
      log("WARNING: #mock-jd not found — interview may already have a linked job, or selector changed");
    }

    const focusTextarea = page.locator("#mock-focus");
    if (await focusTextarea.count()) {
      await focusTextarea.fill("Push me on prioritization trade-offs and how I measure success.");
    }
    await shot(page, "launcher-filled");

    // Interviewer role radios present?
    const roleRadios = await page.locator('input[name="interviewer-role"]').count();
    log(`interviewer role options rendered: ${roleRadios}`);

    const startTrigger = page.locator('button:has-text("Start Mock Interview")').first();
    await startTrigger.scrollIntoViewIfNeeded();
    const disabled = await startTrigger.isDisabled();
    log(`start trigger disabled? ${disabled}`);
    if (disabled) throw new Error("Start Mock Interview button is disabled — readiness gating bug");
    await startTrigger.click();
    await page.waitForTimeout(500);
    await shot(page, "start-dialog");

    const creditsBefore = await creditsRemainingFromDialog(page);
    log(`credits remaining before start: ${creditsBefore}`);
    report.creditsBeforeFirstStart = creditsBefore;

    const confirmBtn = page.getByRole("button", { name: "Start Mock Interview", exact: true });
    await confirmBtn.click();
    log("clicked confirm — waiting for real OpenAI planning call + navigation to studio");

    await page.waitForURL(/\/mock\/[a-f0-9-]+$/, { timeout: 60000 });
    log(`navigated to studio: ${page.url()}`);
    const sessionMatch = page.url().match(/\/mock\/([a-f0-9-]+)$/);
    const sessionId = sessionMatch ? sessionMatch[1] : null;
    log(`sessionId: ${sessionId}`);
    report.sessionId = sessionId;

    await page.waitForTimeout(1500);
    await shot(page, "studio-opening");

    // ── Multi-turn conversation ──
    const answers = [
      "In my last role I led the redesign of our referral flow at Kuku Technologies. We simplified the invite screen and added a progress tracker, and it grew monthly signups by 22% in one quarter, measured against a holdout group in an A/B test.",
      "The biggest trade-off was scope. We originally wanted to rebuild the entire onboarding at the same time, but I pushed to ship the referral flow first because it was decoupled and had a clearer success metric, and we could measure it in two weeks instead of waiting for the full onboarding rebuild.",
      "I prioritize using a RICE-style framework — reach, impact, confidence, and effort — but I weight confidence heavily for growth bets since a lot of our ideas come from qualitative feedback rather than hard data. I run this weekly with the two engineering leads on my pod.",
      "For success metrics I look at activation rate and D7 retention as North Star metrics, and I present them to the executive team monthly in a short readout with the underlying funnel breakdown so they can see where drop-off happens.",
      "A time I disagreed with an engineering lead was during the KYC onboarding redesign — he wanted to ship the full redesign at once, and I pushed for shipping the progress indicator first since it was lower risk. We ended up doing a phased rollout, and drop-off fell from 41% to 26% over the following six weeks.",
      "I don't have hands-on SQL production experience beyond writing basic queries for funnel analysis in Amplitude; my engineering team usually builds the deeper data models for me.",
    ];

    for (let i = 0; i < answers.length; i++) {
      log(`turn ${i}: reading current question`);
      const questionLocator = page.locator("main, body").locator("text=/.{20,}/").first();
      const questionText = await page
        .locator("p.font-display")
        .first()
        .textContent()
        .catch(() => null);
      log(`turn ${i} question: ${questionText?.slice(0, 160)}`);

      const textarea = page.locator('textarea[placeholder*="Type your answer"]');
      await textarea.waitFor({ state: "visible", timeout: 60000 });
      await textarea.fill(answers[i]);
      await shot(page, `turn${i}-answer-typed`);

      const sendBtn = page.getByRole("button", { name: "Send answer" });
      await sendBtn.click();
      log(`turn ${i}: submitted, waiting for next AI turn (real OpenAI call)`);

      // Wait for the textarea to reappear enabled with fresh content — proxy for "AI responded".
      await page.waitForTimeout(2000);
      await textarea.waitFor({ state: "visible", timeout: 45000 }).catch(() => {});
      await page.waitForFunction(
        () => {
          const ta = document.querySelector('textarea[placeholder*="Type your answer"]');
          return ta && !ta.disabled && ta.value === "";
        },
        { timeout: 45000 },
      );
      await shot(page, `turn${i}-next-question`);
      log(`turn ${i}: next question loaded`);

      if (i === 2) {
        // ── Pause / resume test, mid-conversation ──
        log("testing pause");
        const pauseBtn = page.getByRole("button", { name: /Pause/ });
        await pauseBtn.click();
        await page.waitForTimeout(1000);
        await shot(page, "paused-overlay");
        const pausedText = await page.textContent("body");
        if (!/Interview paused/i.test(pausedText)) throw new Error("Pause overlay did not appear");
        log("pause overlay confirmed, question should be hidden");

        const resumeBtn = page.getByRole("button", { name: /Resume interview/ });
        await resumeBtn.click();
        await page.waitForTimeout(1000);
        await shot(page, "resumed");
        log("resumed");
      }
    }

    // ── End interview ──
    log("ending interview");
    const endBtn = page.getByRole("button", { name: "End", exact: true });
    await endBtn.click();
    await page.waitForTimeout(500);
    await shot(page, "end-dialog");
    const endConfirmBtn = page.getByRole("button", { name: "End interview" });
    await endConfirmBtn.click();
    log("confirmed end — waiting for concluding screen + report generation (real OpenAI call)");

    await page.waitForTimeout(1500);
    await shot(page, "concluding");

    await page.waitForURL(/\/report$/, { timeout: 90000 });
    log(`navigated to report: ${page.url()}`);
    await page.waitForTimeout(1500);
    await shot(page, "report-page");

    const reportBodyText = await page.textContent("body");
    fs.writeFileSync(path.resolve("./report-text.txt"), reportBodyText);
    log("report text dumped to report-text.txt for grounding review");

    // Click a citation chip if present and confirm it scrolls without error.
    const citeBtn = page.locator('button:has-text("Question ")').first();
    if (await citeBtn.count()) {
      await citeBtn.click();
      await page.waitForTimeout(500);
      await shot(page, "report-citation-scrolled");
      log("clicked a citation chip");
    }

    // ── Back to launcher: verify past session + credits ──
    await page.goto(`${BASE_URL}/dashboard/interviews/${state.interviewId}`);
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Open Mock Interview"), button:has-text("Start Mock Interview")');
    await page.waitForSelector("text=Who is interviewing you?", { timeout: 45000 });
    await shot(page, "launcher-after-first-session");

    const pastSessionsText = await page.textContent("body");
    log(`Past sessions section present: ${/Past mock interviews/i.test(pastSessionsText)}`);

    // ── Second session ──
    const jdTextarea2 = page.locator("#mock-jd");
    if (await jdTextarea2.count()) await jdTextarea2.fill(JOB_DESCRIPTION);
    const startTrigger2 = page.locator('button:has-text("Start Mock Interview")').first();
    await startTrigger2.click();
    await page.waitForTimeout(500);
    const creditsBeforeSecond = await creditsRemainingFromDialog(page);
    log(`credits remaining before SECOND start: ${creditsBeforeSecond}`);
    report.creditsBeforeSecondStart = creditsBeforeSecond;
    await shot(page, "second-start-dialog");

    const confirmBtn2 = page.getByRole("button", { name: "Start Mock Interview", exact: true });
    await confirmBtn2.click();
    await page.waitForURL(/\/mock\/[a-f0-9-]+$/, { timeout: 60000 });
    log(`second session started: ${page.url()}`);
    await page.waitForTimeout(1500);
    await shot(page, "second-session-studio");

    report.ok = true;
    log(`DONE. console errors captured: ${consoleErrors.length}`);
    if (consoleErrors.length) log(JSON.stringify(consoleErrors, null, 2));
  } catch (err) {
    log(`FATAL: ${err.stack || err.message}`);
    await shot(page, "ERROR-state");
    report.ok = false;
    report.error = err.message;
  } finally {
    fs.writeFileSync(path.resolve("./flow-report.json"), JSON.stringify(report, null, 2));
    await browser.close();
  }
})();
