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

Requirements:
- 3+ years of product management experience, ideally in consumer fintech.
- Strong analytical skills; comfortable with SQL and product analytics tools (Amplitude, Mixpanel).
- Experience running A/B tests and translating results into product decisions.
- Track record of leading cross-functional teams without direct authority.
`.trim();

// Deliberately natural, varied-length answers — including a short/weak one, so
// we can see whether the interviewer probes appropriately and then MOVES ON
// rather than interrogating the same thread.
const ANSWERS = [
  "Sure. I'm a product manager with about four years of experience, currently at Kuku Technologies where I own the referral and rewards product line for a consumer fintech app with around 2 million monthly actives. Before that I was an APM on the onboarding squad, and I started out as a product intern doing churn analysis. Most of my work has been growth and activation.",
  "The one I'm proudest of is the referral flow redesign. Our invite screen had a 41% drop-off, so I simplified it to a single step and added a progress tracker showing how close you were to the reward. We ran it as a 50/50 A/B test in Amplitude over two weeks and it grew monthly signups by 22%.",
  "I owned the whole thing end to end — I wrote the PRD, ran the weekly prioritization with two engineering leads, and worked with one designer. The hardest call was cutting the social-sharing piece we'd originally scoped, because it would have added three weeks and we couldn't measure it cleanly.",
  "I use a RICE-style framework, but I weight confidence heavily for growth bets since a lot of our ideas come from qualitative feedback rather than hard data. I run it weekly with the engineering leads so the roadmap is a shared decision rather than something I hand down.",
  "I think this role is mostly about owning activation as a full funnel rather than individual features, and working closely with engineering and design without formal authority. That's basically what I've been doing, which is why it appealed to me.",
  "Honestly, not much beyond what's in the posting.",
  "The KYC onboarding redesign. An engineering lead wanted to ship the whole redesign at once and I pushed for a phased rollout starting with the progress indicator, because it was lower risk and we could measure it. We disagreed for about a week. We ended up phasing it and drop-off fell from 41% to 26% over six weeks.",
  "I'd start by segmenting where the drop is happening — which step, which platform, which user cohort — before assuming a cause. Then I'd look at whether anything shipped recently that correlates, check for instrumentation issues first since those are common, and only then start forming product hypotheses to test.",
];

function log(m) {
  console.log(`[realism] ${new Date().toISOString().slice(11, 19)} ${m}`);
}
let i = 0;
async function shot(page, name) {
  i += 1;
  const p = path.join(SHOT_DIR, `r${String(i).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
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

  const transcript = [];
  try {
    await page.goto(`${BASE_URL}/dashboard/interviews/${state.interviewId}`);
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Open Mock Interview"), button:has-text("Start Mock Interview")');
    await page.waitForSelector("text=Who is interviewing you?", { timeout: 60000 });

    const jd = page.locator("#mock-jd");
    if (await jd.count()) await jd.fill(JOB_DESCRIPTION);

    await page.locator('button:has-text("Start Mock Interview")').first().click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Start Mock Interview", exact: true }).click();
    log("started — waiting for planning call");
    await page.waitForURL(/\/mock\/[a-f0-9-]+$/, { timeout: 90000 });
    const sessionId = page.url().match(/\/mock\/([a-f0-9-]+)$/)[1];
    log(`sessionId ${sessionId}`);
    fs.writeFileSync("./realism-session.txt", sessionId);

    await page.waitForSelector('textarea[placeholder*="Type your answer"]', { timeout: 90000 });
    await page.waitForTimeout(800);
    await shot(page, "opening");

    const opening = await page.locator("p.font-display").first().textContent();
    log(`OPENING: ${opening}`);
    transcript.push({ turn: 0, q: opening });

    for (let n = 0; n < ANSWERS.length; n++) {
      const ta = page.locator('textarea[placeholder*="Type your answer"]');
      await ta.waitFor({ state: "visible", timeout: 90000 });
      await ta.fill(ANSWERS[n]);
      await page.getByRole("button", { name: "Send answer" }).click();
      await page.waitForFunction(
        () => {
          const el = document.querySelector('textarea[placeholder*="Type your answer"]');
          return el && !el.disabled && el.value === "";
        },
        { timeout: 90000 },
      );
      await page.waitForTimeout(400);
      const q = await page.locator("p.font-display").first().textContent();
      log(`Q${n + 1}: ${q}`);
      transcript.push({ turn: n + 1, answer: ANSWERS[n], q });

      const ended = await page.locator("text=The interview is finished").isVisible().catch(() => false);
      if (ended) {
        log("AI concluded the interview on its own");
        break;
      }
    }

    await shot(page, "mid-interview");
    fs.writeFileSync("./realism-transcript.json", JSON.stringify(transcript, null, 2));
    log(`console errors: ${consoleErrors.length}`);
    if (consoleErrors.length) log(JSON.stringify(consoleErrors, null, 2));
  } catch (err) {
    log(`FATAL: ${err.message}`);
    await shot(page, "ERROR");
    fs.writeFileSync("./realism-transcript.json", JSON.stringify(transcript, null, 2));
  } finally {
    await browser.close();
  }
})();
