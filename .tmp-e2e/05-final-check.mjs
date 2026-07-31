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
- 3+ years of product management experience, ideally in consumer fintech.
- Strong analytical skills; comfortable with SQL and product analytics tools (Amplitude, Mixpanel).
- Experience running A/B tests and translating results into product decisions.
- Track record of leading cross-functional teams without direct authority.
`.trim();

// Generic-but-plausible answers. They deliberately don't line up perfectly
// with an adaptive interviewer's questions — the point is to observe pacing,
// coverage and transitions, not to simulate a perfect candidate.
const POOL = [
  "Sure. I'm a product manager with about four years of experience, currently at Kuku Technologies where I own the referral and rewards product line for a consumer fintech app with roughly 2 million monthly actives. Before that I was an APM on the onboarding squad.",
  "The project I'm proudest of is the referral flow redesign. Our invite screen had a 41% drop-off, so I simplified it to a single step and added a progress tracker. We ran a 50/50 A/B test in Amplitude over two weeks and it grew monthly signups by 22%.",
  "I owned it end to end — wrote the PRD, ran weekly prioritization with two engineering leads, worked with one designer. The hardest call was cutting the social-sharing piece we'd scoped, because it would have added three weeks and we couldn't measure it cleanly.",
  "I use a RICE-style framework but weight confidence heavily for growth bets, since a lot of our ideas come from qualitative feedback rather than hard data. I run it weekly with the engineering leads so the roadmap is a shared decision.",
  "I think this role is mostly about owning activation as a full funnel rather than individual features, and doing it without formal authority over engineering and design. That's close to what I do now, which is why it appealed to me.",
  "The KYC onboarding redesign. An engineering lead wanted to ship the whole thing at once; I pushed for a phased rollout starting with the progress indicator because it was lower risk and measurable. We phased it and drop-off fell from 41% to 26% over six weeks.",
  "I'd segment where the drop is happening first — which step, platform, and cohort — before assuming a cause. Then check whether anything shipped recently that correlates, rule out instrumentation issues, and only then form product hypotheses to test.",
  "Honestly that's an area I'm still developing. I've mostly worked with engineering and design, and I've had less exposure to working directly with compliance or legal stakeholders.",
  "I track activation rate and D7 retention as the North Star metrics, and present them monthly to the exec team with the funnel breakdown so they can see exactly where drop-off happens.",
  "I'd want to understand what the team's biggest constraint is right now — whether it's engineering capacity, data quality, or clarity on strategy — because the first 90 days should go wherever the bottleneck actually is.",
  "At Kuku I inherited a roadmap that was mostly feature requests from sales. I spent three weeks re-grounding it in activation data and got buy-in by showing the projected impact rather than arguing about priorities abstractly.",
  "I'd say my biggest weakness is that I go deep on analysis before committing, which is good for big bets but slows me down on reversible decisions. I've been consciously trying to ship smaller things faster.",
];

function log(m) {
  console.log(`[final] ${new Date().toISOString().slice(11, 19)} ${m}`);
}
let si = 0;
async function shot(page, name) {
  si += 1;
  await page
    .screenshot({ path: path.join(SHOT_DIR, `x${String(si).padStart(2, "0")}-${name}.png`), fullPage: true })
    .catch(() => {});
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: state.storageStatePath,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const questions = [];
  try {
    await page.goto(`${BASE_URL}/dashboard/interviews/${state.interviewId}`);
    await page.waitForLoadState("networkidle");
    await page.click('button:has-text("Open Mock Interview"), button:has-text("Start Mock Interview")');
    await page.waitForSelector("text=Who is interviewing you?", { timeout: 90000 });
    await shot(page, "launcher-sticky-cta");

    // Sticky CTA must be visible without scrolling.
    const ctaVisible = await page
      .locator('button:has-text("Start Mock Interview")')
      .first()
      .isVisible();
    log(`launcher CTA visible at top of page: ${ctaVisible}`);

    const jd = page.locator("#mock-jd");
    if (await jd.count()) await jd.fill(JOB_DESCRIPTION);

    await page.locator('button:has-text("Start Mock Interview")').first().click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Start Mock Interview", exact: true }).click();
    log("started — planning call");
    await page.waitForURL(/\/mock\/[a-f0-9-]+$/, { timeout: 120000 });
    const sessionId = page.url().match(/\/mock\/([a-f0-9-]+)$/)[1];
    fs.writeFileSync("./final-session.txt", sessionId);
    log(`sessionId ${sessionId}`);

    await page.waitForSelector('textarea[placeholder*="Type your answer"]', { timeout: 120000 });
    await page.waitForTimeout(800);
    await shot(page, "studio-opening");

    // Composer controls must be inside the viewport (never below the fold).
    const sendBox = await page.getByRole("button", { name: "Send answer" }).boundingBox();
    const vh = page.viewportSize().height;
    log(`Send button bottom=${sendBox ? Math.round(sendBox.y + sendBox.height) : "?"} viewport=${vh} (must be <= viewport)`);

    const opening = await page.locator("p.font-display").first().textContent();
    log(`OPENING: ${opening}`);
    questions.push(opening);

    for (let n = 0; n < 14; n++) {
      const ended = await page
        .locator("text=The interview is finished")
        .isVisible()
        .catch(() => false);
      if (ended) {
        log(`interview concluded naturally after ${n} answers`);
        break;
      }
      const ta = page.locator('textarea[placeholder*="Type your answer"]');
      if (!(await ta.isVisible().catch(() => false))) {
        log("composer gone — interview likely concluded");
        break;
      }
      await ta.fill(POOL[n % POOL.length]);
      await page.getByRole("button", { name: "Send answer" }).click();
      await page
        .waitForFunction(
          () => {
            const el = document.querySelector('textarea[placeholder*="Type your answer"]');
            return !el || (!el.disabled && el.value === "");
          },
          { timeout: 120000 },
        )
        .catch(() => {});
      await page.waitForTimeout(400);
      const q = await page
        .locator("p.font-display")
        .first()
        .textContent()
        .catch(() => null);
      if (q) {
        log(`Q${n + 1}: ${q}`);
        questions.push(q);
      }
    }

    await shot(page, "studio-late");
    fs.writeFileSync("./final-questions.json", JSON.stringify(questions, null, 2));

    // End and get the report so the new section can be verified.
    const endBtn = page.getByRole("button", { name: "End", exact: true });
    if (await endBtn.isVisible().catch(() => false)) {
      await endBtn.click();
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: "End interview" }).click();
      log("ended — generating report");
    }
    await page.waitForURL(/\/report$/, { timeout: 150000 });
    await page.waitForTimeout(2000);
    await shot(page, "report");
    const reportText = await page.textContent("body");
    fs.writeFileSync("./final-report.txt", reportText);
    log(`report has "Additional Questions You Should Prepare": ${/Additional Questions You Should Prepare/i.test(reportText)}`);

    log(`console errors: ${consoleErrors.length}`);
    if (consoleErrors.length) log(JSON.stringify(consoleErrors.slice(0, 10), null, 2));
  } catch (err) {
    log(`FATAL: ${err.message}`);
    await shot(page, "ERROR");
    fs.writeFileSync("./final-questions.json", JSON.stringify(questions, null, 2));
  } finally {
    await browser.close();
  }
})();
