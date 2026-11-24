// Renders video/clinicians/clinicians.html to video/clinicians/hearth-for-clinicians.mp4 (1920×1080, 30 fps).
//   python3 -m http.server 8090 --bind 127.0.0.1 &   (from the repository root)
//   node video/clinicians/build.cjs [--test 12,40,70]   (--test writes single frames only)
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const FPS = 30;
const OUT = path.join(__dirname, "hearth-for-clinicians.mp4");
const testArg = process.argv.indexOf("--test");

(async () => {
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("http://127.0.0.1:8090/video/clinicians/clinicians.html");
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
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), "hearth-clin-"));
  const n = Math.round(total * FPS);
  // A long run of screenshots can stall Chromium now and then: retry, and reload the page if
  // a frame keeps timing out, then carry on from that frame.
  const reload = async () => {
    await page.reload();
    await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
  };
  for (let i = 0; i < n; i++) {
    const file = path.join(frames, `f${String(i).padStart(5, "0")}.png`);
    for (let attempt = 1; ; attempt++) {
      try {
        await page.evaluate((t) => window.render(t), i / FPS);
        await page.screenshot({ path: file, timeout: 20000 });
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        console.log(`frame ${i}: ${e.name}, retry ${attempt}`);
        if (attempt >= 2) await reload();
      }
    }
    if (i % 300 === 0) console.log(`frame ${i}/${n}`);
  }
  await browser.close();
  // Calm background music made by music.py, mixed in softly (about -20 LUFS).
  const music = path.join(frames, "music.wav");
  execFileSync("python3", [path.join(__dirname, "music.py"), String(Math.ceil(total)), music]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(frames, "f%05d.png"), "-i", music, "-map", "0:v", "-map", "1:a", "-af", "loudnorm=I=-20:TP=-2:LRA=7", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", OUT]);
  fs.rmSync(frames, { recursive: true, force: true });
  console.log("wrote", OUT, (fs.statSync(OUT).size / 1e6).toFixed(1), "MB", "errors", errs);
})();
