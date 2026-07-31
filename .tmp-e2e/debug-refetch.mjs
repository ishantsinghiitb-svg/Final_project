import { chromium } from "playwright";
import fs from "node:fs";

const state = JSON.parse(fs.readFileSync("./state.json", "utf8"));
const url = process.argv[2]; // studio URL with an UNANSWERED current turn

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: state.storageStatePath,
  });
  const page = await context.newPage();

  page.on("request", (req) => {
    if (req.url().includes("mock_interview_turns") || req.url().includes("submitMockInterviewAnswer") || req.url().includes("_serverFn")) {
      console.log(">>", req.method(), req.url());
    }
  });
  page.on("response", async (res) => {
    if (res.url().includes("mock_interview_turns")) {
      console.log("<<", res.status(), res.url());
      try {
        const body = await res.text();
        console.log("   body:", body.slice(0, 500));
      } catch {}
    }
  });

  await page.goto(url);
  await page.waitForSelector('textarea[placeholder*="Type your answer"]', { timeout: 60000 });
  const before = await page.locator("p.font-display").first().textContent();
  console.log("BEFORE question:", before);

  await page.locator('textarea[placeholder*="Type your answer"]').fill("Debug answer for network inspection purposes, testing refetch behavior.");
  await page.getByRole("button", { name: "Send answer" }).click();
  console.log("clicked send, waiting...");
  await page.waitForTimeout(20000);

  const after = await page.locator("p.font-display").first().textContent();
  console.log("AFTER question (no refresh):", after);
  console.log("CHANGED:", before !== after);

  await page.screenshot({ path: "./shots/debug-after-submit.png", fullPage: true });
  await browser.close();
})();
