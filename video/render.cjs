// Renders video/compare.html to video/hearth-with-without.mp4 (1920×1080, 30 fps).
//   npx tsx video/compare-data.ts
//   python3 -m http.server 8090 --bind 127.0.0.1 &   (from the repository root)
//   node video/render.cjs
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const FPS = 30;
const OUT = path.join(__dirname, "hearth-with-without.mp4");
const frames = fs.mkdtempSync(path.join(os.tmpdir(), "hearth-frames-"));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto("http://127.0.0.1:8090/video/compare.html");
  await page.waitForFunction(() => window.ready === true, null, { timeout: 20000 });
  const total = await page.evaluate(() => window.TOTAL);
  const n = Math.round(total * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    await page.screenshot({ path: path.join(frames, `f${String(i).padStart(5, "0")}.png`) });
    if (i % 150 === 0) console.log(`frame ${i}/${n}`);
  }
  await browser.close();
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(frames, "f%05d.png"), "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT]);
  fs.rmSync(frames, { recursive: true, force: true });
  console.log("wrote", OUT, (fs.statSync(OUT).size / 1e6).toFixed(1), "MB");
})();
