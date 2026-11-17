// Renders video/demo/jury.html to video/demo/hearth-jury-draft.mp4 (1920×1080, 30 fps).
//   node video/demo/capture.cjs        (records the live demo from the app on :4173)
//   python3 -m http.server 8090 --bind 127.0.0.1 &   (from the repository root)
//   node video/demo/build.cjs [--test 12,40,70]   (--test writes single frames only)
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const FPS = 30;
const OUT = path.join(__dirname, "hearth-jury-draft.mp4");
const testArg = process.argv.indexOf("--test");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("http://127.0.0.1:8090/video/demo/jury.html");
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
  const total = await page.evaluate(() => window.TOTAL);
  console.log("total", total.toFixed(1), "s", JSON.stringify(await page.evaluate(() => window.SECTIONS)));
  if (testArg > 0) {
    const dir = path.join(__dirname, "out"); fs.mkdirSync(dir, { recursive: true });
    for (const t of process.argv[testArg + 1].split(",").map(Number)) {
      await page.evaluate((t) => window.render(t), t);
      await page.screenshot({ path: path.join(dir, `test_${t}.png`) });
    }
    console.log("errors", errs);
    await browser.close();
    return;
  }
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), "hearth-jury-"));
  const n = Math.round(total * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    await page.screenshot({ path: path.join(frames, `f${String(i).padStart(5, "0")}.png`) });
    if (i % 300 === 0) console.log(`frame ${i}/${n}`);
  }
  await browser.close();
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(frames, "f%05d.png"), "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT]);
  fs.rmSync(frames, { recursive: true, force: true });
  console.log("wrote", OUT, (fs.statSync(OUT).size / 1e6).toFixed(1), "MB", "errors", errs);
})();
