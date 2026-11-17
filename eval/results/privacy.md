## Metric 10 · Privacy (default scenario, cloud consent off, all 150 days, Chromium)

`node eval/privacy.cjs` and `node eval/privacy.cjs --fake-model` against `vite preview`:

| Mode | Requests leaving the page | Requests containing the persona's words | Ledger (on-device / cloud / fallback) |
|---|---|---|---|
| No on-device model | 0 | 0 | 0 / 0 / 19 |
| Stand-in on-device model (test double for the Prompt API) | 0 | 0 | 17 / 0 / 1 |

With a configured Firebase project (emulators), the app also made 0 requests before consent
(M7 browser test). After consent, no request body contained the persona's words.
