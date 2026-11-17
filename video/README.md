# Demo video: with and without Hearth

`hearth-with-without.mp4` (94 s, 1920×1080) has three parts. 0–38 s shows the same 150 days of the simulated person
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

38–70 s, "What Sam sees in the app": six real screens of the web app
(`apps/web/src/assets/shots/`) on the same simulated days: plan cards (day 1), holiday check
(day 61), Today showing Changed (day 110), the check-in, Sam's plan, the privacy ledger.

70–86 s, "Why it matters", sources shown on screen:
- 332 million people live with depression: WHO depression fact sheet, 2025.
- At least half of those who recover from a first episode have another: Burcusa & Iacono,
  *Risk for recurrence in depression*, Clin Psychol Rev 2007, doi:10.1016/j.cpr.2007.02.005.
- 7 days to notice Sam's drift: Hearth's own simulation, labelled as such, not a clinical result.

86–94 s: end card.

