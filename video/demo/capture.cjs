// Records the live-demo part of the jury video from the real web app (docs: video/demo/README.md).
//   node video/demo/capture.cjs                 → stand-in model (eval/fake-language-model.js)
//   CHROME_PROFILE=<dir> node video/demo/capture.cjs   → your own Chrome with Gemini Nano (untested here)
// Needs the app on HEARTH_URL (default http://localhost:4173, `npm run build -w apps/web && npx vite preview`).
// Writes JPEG frames with timestamps to video/demo/frames/ and frames.json; build.cjs turns them into the video.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.HEARTH_URL || "http://localhost:4173";
const OUT = path.join(__dirname, "frames");
const SAM = "When things go wrong I keep going to bed later, I skip the gym, I stay inside more and I eat badly. I also stop replying to messages. Calling my sister helps, and so does a walk in the morning.";

const TOUCH = `
(() => {
  if (window.__touch) return; window.__touch = true;
  const add = () => {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:99999;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(202,2,106,.18);border:2px solid rgba(202,2,106,.55);pointer-events:none;left:-100px;top:-100px;transition:transform .15s';
    document.body.appendChild(dot);
    addEventListener('mousemove', e => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { dot.style.transform = 'scale(.7)'; dot.style.background = 'rgba(202,2,106,.35)'; }, true);
    addEventListener('mouseup', () => { dot.style.transform = 'scale(1)'; dot.style.background = 'rgba(202,2,106,.18)'; }, true);
  };
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
})();`;

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const real = !!process.env.CHROME_PROFILE;
  const opts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
  const browser = real ? null : await chromium.launch({ args: ["--force-device-scale-factor=2"] });
  const ctx = real ? await chromium.launchPersistentContext(process.env.CHROME_PROFILE, { ...opts, channel: "chrome", headless: false }) : await browser.newContext(opts);
  if (!real) await ctx.addInitScript(fs.readFileSync(path.join(__dirname, "../../eval/fake-language-model.js"), "utf8"));
  await ctx.addInitScript(TOUCH);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on("dialog", (d) => d.accept());
  const pause = (ms) => page.waitForTimeout(ms);
  const marks = [];
  let t0 = null;
  const mark = (name) => { marks.push({ name, abs: Date.now() / 1000 }); console.log("mark", name, ((Date.now() - t0) / 1000).toFixed(1)); };

  const tap = async (locator, { hold = 450 } = {}) => {
    const el = typeof locator === "string" ? page.locator(locator).first() : locator;
    await el.waitFor({ state: "visible", timeout: 60000 });
    const inView = await el.evaluate((e) => { const r = e.getBoundingClientRect(); return r.top > 60 && r.bottom < innerHeight - 190; });
    if (!inView) { await el.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "smooth" })); await pause(650); }
    await pause(200);
    const b = await el.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    await pause(180);
    await page.mouse.down(); await pause(90); await page.mouse.up();
    await pause(hold);
  };
  const scrollBy = async (dy, ms = 900) => {
    await page.evaluate(([dy, ms]) => new Promise((res) => {
      const y0 = scrollY, t = performance.now();
      const step = (n) => { const k = Math.min(1, (n - t) / ms); scrollTo(0, y0 + dy * (1 - Math.pow(1 - k, 3))); k < 1 ? requestAnimationFrame(step) : res(); };
      requestAnimationFrame(step);
    }), [dy, ms]);
    await pause(200);
  };

  // Setup, not recorded: onboarding.
  await page.goto(BASE + "/#/onboarding");
  await page.click("text=Next"); await page.click("text=Next"); await page.click("text=Set up my plan");
  await page.waitForSelector("textarea");
  await page.mouse.move(195, 700);

  // Record from here.
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  let n = 0;
  cdp.on("Page.screencastFrame", async (f) => {
    const file = `f${String(n++).padStart(5, "0")}.jpg`;
    fs.writeFileSync(path.join(OUT, file), Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1, maxWidth: 780, maxHeight: 1688 });
  t0 = Date.now();
  await pause(600);

  // 1. The plan, in Sam's own words.
  mark("plan");
  await tap(page.locator("textarea").first(), { hold: 200 });
  await page.keyboard.type(SAM, { delay: 14 });
  await pause(500);
  await tap("button:has-text('Make cards')", { hold: 300 });
  await page.waitForSelector("text=Save these cards", { timeout: 60000 });
  await page.evaluate(() => scrollTo(0, 0));
  mark("cards");
  await pause(3600); // the "removed" line is visible here
  mark("cards_scroll");
  await scrollBy(520, 1600);
  await pause(1200);
  await tap("button:has-text('Save these cards')", { hold: 600 });

  // Starting point questionnaire (verbatim PHQ-9): scripted answer.
  await page.waitForSelector("text=Your starting point");
  mark("phq");
  await pause(1200);
  await tap("text=Use scripted answer", { hold: 300 });
  await tap("button:has-text('Start')", { hold: 600 });

  // 2. Holiday: a note, one question, the user decides.
  mark("jump_holiday");
  await page.selectOption('select[aria-label="Jump to"]', "holiday");
  await page.waitForSelector("text=Use scripted note", { timeout: 120000 });
  mark("note");
  await page.evaluate(() => scrollTo(0, 0));
  await tap("text=Use scripted note", { hold: 900 });
  await tap('button[aria-label="Confirm what is going on"]', { hold: 300 });
  await page.waitForSelector("text=One quick check");
  mark("holiday_check");
  await pause(2600);
  await tap("button:has-text('Yes')", { hold: 800 });

  // 3. Day 109: Hearth notices.
  mark("jump_change");
  await page.selectOption('select[aria-label="Jump to"]', "first_change");
  await page.waitForFunction(() => document.querySelector(".tm-msg")?.textContent?.includes("First change"), null, { timeout: 180000 });
  await tap("nav.tabs a:has-text('Today')", { hold: 300 });
  await page.evaluate(() => scrollTo(0, 0));
  mark("changed");
  await pause(1600);
  await tap("button:has-text('Why?')", { hold: 2800 });

  // 4. The check-in.
  await tap('button[aria-label="Open check-in"]', { hold: 300 });
  mark("checkin");
  await pause(2200);
  const scale = (label, v) => page.locator(`[role=radiogroup][aria-label="${label}"] button:has-text("${v}")`);
  const groups = await page.locator(".scale[role=radiogroup]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  for (const [i, v] of [[0, 4], [1, 3], [2, 3]]) if (groups[i]) await tap(scale(groups[i], v), { hold: 250 });
  await tap(page.locator(".chips[role=radiogroup]").first().locator("button", { hasText: "Alone" }), { hold: 250 });
  const personal = page.locator(".chips[role=radiogroup]");
  const count = await personal.count();
  for (let i = 1; i < count; i++) await tap(personal.nth(i).locator("button").nth(1), { hold: 250 });
  await tap("button:has-text('Save')", { hold: 900 });
  const back = page.locator("text=Back to today");
  if (await back.count()) await pause(1200);

  // 5. Sam's own plan.
  await tap("nav.tabs a:has-text('Plan')", { hold: 300 });
  await page.evaluate(() => scrollTo(0, 0));
  mark("myplan");
  await pause(3000);
  await scrollBy(300, 1200);
  await pause(1200);

  // 6. The privacy ledger.
  await tap("nav.tabs a:has-text('Privacy')", { hold: 300 });
  await page.evaluate(() => scrollTo(0, 0));
  mark("ledger");
  await pause(3200);
  await scrollBy(260, 1200);
  await pause(1500);
  mark("end");

  await cdp.send("Page.stopScreencast");
  await pause(300);
  const tStart = frames[0].t;
  fs.writeFileSync(path.join(__dirname, "frames.json"), JSON.stringify({ model: real ? "chrome" : "stand-in", recordedAt: new Date().toISOString(), frames: frames.map((f) => ({ file: f.file, t: f.t - tStart })), marks: marks.map((m) => ({ name: m.name, at: m.abs - tStart })) }, null, 1));
  console.log("frames", frames.length);
  await ctx.close();
  if (browser) await browser.close();
})();
