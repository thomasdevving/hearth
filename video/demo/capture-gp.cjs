// Captures the GP page (#/plan_print) for the jury video: video/demo/assets/gp-page.png and
// gp-page.json (the boxes of its parts, relative to the page, so the callouts line up).
//   node video/demo/capture-gp.cjs     (app on http://localhost:4173, stand-in model)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.env.HEARTH_URL || "http://localhost:4173";

(async () => {
  const browser = await chromium.launch({ args: ["--force-device-scale-factor=2"] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(fs.readFileSync(path.join(__dirname, "../../eval/fake-language-model.js"), "utf8"));
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const click = async (sel) => { await page.locator(sel).first().evaluate((e) => e.click()); await page.waitForTimeout(300); };
  await page.goto(BASE + "/#/onboarding");
  await click("text=Next"); await click("text=Next"); await click("text=Set up my plan");
  await click("text=Use Sam's words"); await click("text=Make cards");
  await page.waitForSelector("text=Save these cards"); await click("text=Save these cards");
  await page.waitForSelector("text=Your starting point"); await click("text=Use scripted answer"); await click('button:has-text("Start")');
  await page.selectOption('select[aria-label="Jump to"]', "first_change");
  await page.waitForFunction(() => document.querySelector(".tm-msg")?.textContent?.includes("First change"), null, { timeout: 180000 });
  await page.goto(BASE + "/#/plan_print");
  await page.waitForSelector("article.gp-doc h1");
  await page.addStyleTag({ content: ".timemachine,.demo-banner{display:none!important}" });
  await page.waitForTimeout(800);
  const doc = page.locator("article.gp-doc");
  await doc.screenshot({ path: path.join(__dirname, "assets/gp-page.png") });
  const boxes = await doc.evaluate((a) => {
    const base = a.getBoundingClientRect();
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }; };
    const out = { page: { w: base.width, h: base.height }, parts: {} };
    const head = a.querySelector(".gp-head"); if (head) out.parts.head = box(head);
    a.querySelectorAll("section").forEach((s) => { const t = s.querySelector("h2")?.textContent?.trim() ?? ""; out.parts[t] = box(s); });
    a.querySelectorAll(".gp-phases tbody tr").forEach((tr, i) => { out.parts[`phase${i + 1}`] = box(tr); });
    const foot = a.querySelector(".gp-foot"); if (foot) out.parts.foot = box(foot);
    return out;
  });
  fs.writeFileSync(path.join(__dirname, "assets/gp-page.json"), JSON.stringify(boxes, null, 1));
  console.log(JSON.stringify(boxes));
  await browser.close();
})();
