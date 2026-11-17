// docs/10 metric 10: run the default scenario with cloud consent off while recording every
// request, and count requests that leave the page (and any that contain the persona's words).
//   npm run build -w apps/web && npx vite preview --outDir apps/web/dist --port 4173 &
//   node eval/privacy.cjs [--fake-model]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE ?? "http://localhost:4173";
const fake = process.argv.includes("--fake-model");
const S3_WORDS = /Spain|skip the gym|sister|going to bed later|didn't eat|stayed in/i;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  if (fake) await ctx.addInitScript(fs.readFileSync(path.join(__dirname, "fake-language-model.js"), "utf8"));
  const page = await ctx.newPage();
  const leaving = [];
  page.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith(BASE) && !u.startsWith("data:") && !u.startsWith("blob:")) leaving.push({ url: u, body: r.postData() ?? "" });
  });
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE + "/");
  await page.click("text=Next");
  await page.click("text=Next");
  await page.click("text=Set up my plan");
  await page.click("text=Use Sam's words");
  await page.click("text=Make cards");
  await page.waitForTimeout(800);
  if (await page.$("text=Save these cards")) await page.click("text=Save these cards");
  else {
    await page.click("text=Use Sam's confirmed cards");
    await page.click("text=Save these cards");
  }
  await page.click("text=Use scripted answer");
  await page.click('button:has-text("Start")');
  await page.selectOption('select[aria-label="Jump to"]', "holiday");
  await page.waitForSelector("text=Use scripted note", { timeout: 60000 });
  await page.click("text=Use scripted note");
  await page.waitForTimeout(500);
  const cc = await page.$('button[aria-label="Confirm what is going on"]');
  if (cc) {
    await cc.click();
    await page.waitForSelector('button:has-text("Yes")');
    const chip = await page.$('button[role=radio]:has-text("On holiday")');
    if (chip) await chip.click();
    await page.click('button:has-text("Yes")');
  }
  await page.selectOption('select[aria-label="Jump to"]', "first_change");
  await page.waitForFunction(() => document.querySelector(".tm-msg")?.textContent?.includes("First change"), null, { timeout: 120000 });
  await page.goto(BASE + "/#/home");
  await page.waitForTimeout(500);
  const ci = await page.$('button[aria-label="Open check-in"]');
  if (ci) {
    await ci.click();
    await page.waitForTimeout(800);
    await page.click("text=Use scripted answer");
    await page.waitForTimeout(800);
  }
  await page.click("text=Answer with Sam");
  await page.click('button[aria-label="Play"]');
  await page.waitForFunction(() => /End of the replay|support/.test(document.querySelector(".tm-msg")?.textContent ?? ""), null, { timeout: 300000 });
  await page.goto(BASE + "/#/weekly");
  await page.waitForTimeout(1500);
  const ledger = await page.evaluate(
    () =>
      new Promise((res) => {
        const q = indexedDB.open("baseline");
        q.onsuccess = () => {
          const g = q.result.transaction("ledger").objectStore("ledger").getAll();
          g.onsuccess = () => res(g.result.map((e) => e.ranOn));
        };
      }),
  );
  const count = (k) => ledger.filter((x) => x === k).length;
  const result = {
    mode: fake ? "stand-in on-device model" : "no on-device model",
    requestsLeavingThePage: leaving.length,
    requestsWithPersonaText: leaving.filter((r) => S3_WORDS.test(r.body) || S3_WORDS.test(r.url)).length,
    ledger: { on_device: count("on_device"), cloud: count("cloud"), none: count("none") },
  };
  console.log(JSON.stringify(result));
  await browser.close();
})();
