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
  page.on("request", (req) => {
    if (req.url().includes("_serverFn") || req.url().includes("pauseMockInterview")) {
      console.log(">> REQ", req.method(), req.url().slice(0, 140));
    }
  });
  page.on("response", async (res) => {
    if (res.url().includes("_serverFn")) {
      console.log("<< RES", res.status(), res.url().slice(0, 140));
      try {
        const body = await res.text();
        console.log("   body:", body.slice(0, 400));
      } catch {}
    }
  });

  await page.goto(url);
  await page.waitForSelector('textarea[placeholder*="Type your answer"]', { timeout: 60000 });
  console.log("studio loaded, clicking Pause");

  const pauseBtn = page.getByRole("button", { name: "Pause", exact: true });
  console.log("pause button count:", await pauseBtn.count());
  await pauseBtn.click();
  console.log("clicked, waiting 5s...");
  await page.waitForTimeout(5000);

  const bodyText = await page.textContent("body");
  console.log("contains 'Interview paused':", /Interview paused/i.test(bodyText));
  console.log("contains 'Resume interview':", /Resume interview/i.test(bodyText));
  await page.screenshot({ path: "./shots/debug-pause-5s.png", fullPage: true });

  await browser.close();
})();
