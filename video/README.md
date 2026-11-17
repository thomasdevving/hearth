# Demo video: with and without Hearth

`hearth-with-without.mp4` (46 s, 1920×1080) shows the same 150 days of the simulated person
Sam twice: without Hearth, and with Hearth. Every number comes from the real engine run
(seed 1, default scenario). How Sam feels is the persona's simulated mood; it is shown on
both sides because it is the same person.

Regenerate:

```bash
npx tsx video/compare-data.ts
```
```bash
python3 -m http.server 8090 --bind 127.0.0.1
```
```bash
node video/render.cjs
```
