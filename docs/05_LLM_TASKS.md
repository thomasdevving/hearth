# 05 · LLM tasks, routing and guardrails

## 1. Role of the model

The model **reads, extracts, selects and phrases**. Code computes, decides and verifies.
Every task returns structured output that is validated in code before use (rule R8).

Three things make the AI load-bearing in this product:
1. It turns the user's own words into a measuring instrument (tasks G, G2, I).
2. It removes false alarms by understanding context (task H).
3. It decides nothing about *where* data goes: a policy in code routes each task between
   the on-device and the cloud model from the data's sensitivity and the user's consent.

## 2. Sensitivity classes and routing

| Class | What | Examples |
|---|---|---|
| **S3** | Raw personal content | Free text, transcripts, the plan in the user's words, place names, photos |
| **S2** | Derived personal values for single days or tests | "home more than usual for 4 days", a PHQ-9 total |
| **S1** | Weekly aggregates the user has approved for sharing | `WeekAggregate` (`docs/07_DATA_MODEL.md` §3) |

`route(req)` in `packages/engine/src/routing.ts` is the only place this is decided.

```ts
interface RouteRequest {
  dataClass: "S1" | "S2" | "S3"
  cloudConsent: boolean
  onDeviceAvailable: boolean
  online: boolean
  prefersCloud: boolean          // task needs long output or long context
  hasLiteVariant: boolean        // task has a short on-device version
}
type RouteDecision =
  | { run: "model"; mode: "ONLY_ON_DEVICE" | "PREFER_ON_DEVICE" | "PREFER_IN_CLOUD" | "ONLY_IN_CLOUD"; variant: "full" | "lite" }
  | { run: "fallback"; reason: "no_model" | "no_consent" | "offline" }
```

| Class | Condition | Decision |
|---|---|---|
| S3 | on-device available | `ONLY_ON_DEVICE` |
| S3 | not available | `fallback: no_model` — **never cloud** |
| S2 | on-device available, consent | `PREFER_ON_DEVICE` |
| S2 | on-device available, no consent | `ONLY_ON_DEVICE` |
| S2 | not available, consent, online | `ONLY_IN_CLOUD` |
| S2 | not available, otherwise | `fallback` |
| S1 | no consent | `fallback: no_consent` |
| S1 | consent, `prefersCloud`, online, has lite | `PREFER_IN_CLOUD` (lite variant if it lands on-device) |
| S1 | consent, `prefersCloud`, online, no lite | `ONLY_IN_CLOUD` |
| S1 | consent, offline, has lite, on-device available | `ONLY_ON_DEVICE`, `variant: lite` |
| S1 | consent, offline, otherwise | `fallback: offline` |

All four Firebase AI Logic inference modes are used, each for a stated reason. The mode
names above are logical; map them to the SDK's enum on each platform.

## 3. Task list

| Id | Task | Class | Pri | Prefers cloud | Fallback without a model |
|---|---|---|---|---|---|
| G | Plan in own words → rules, items, actions | S3 | P0 | no | Form: pick signs and type actions by hand |
| G2 | Photo of a paper plan → text → G | S3 | P1 | no | Type it |
| H | Free text → context label | S3 | P0 | no | One-tap context picker |
| I | Spoken check-in → answers to personal items | S3 | P1 | no | Tap the answers |
| A | Check-in introduction | S2 | P0 | no | Template sentence |
| B | Diary markers | S3 | P1 | no | Deterministic language features only |
| C | Explain a questionnaire result | S2 | P0 | no | Template per severity band |
| K | Select which of the user's own actions fit today | S3 | P1 | no | Show all actions |
| Q | Ask your data | S2 | P1 | no | Hidden |
| P | Privacy gateway: week's texts → shareable note | S3 | P1 | no | No note is shared |
| D | Weekly reflection (lite on-device, full in cloud) | S1 | P0 | yes | Template with the numbers |
| E | Clinician report with questions to bring | S1 | P1 | yes | Table of aggregates only |
| R | Check-in text → which of the user's own signs it describes (recall what helped) | S3 | P1 | no | The user picks a sign from their own list |
| T | Saved "what helped" note → a short text to someone they trust | S3 | P1 | no | The person's saved message, or the message quoted in their note |

Schemas are in `shared/schemas/<id>.schema.json`; system prompts in
`shared/prompts/<id>.md`. On iOS, mirror each schema as a `@Generable` Swift type; the
engine still validates the JSON.

## 4. Task details

### G · Plan → rules, check-in items, actions
- **When:** `plan_setup`, and whenever the user edits the plan.
- **Input:** the user's text (typed, spoken, or from G2). Two prompts in the UI: "How does
  a dip start for you?" and "What helps when that happens?".
- **Output:** `rules[]` (feature + direction + optional `place_label` + quote),
  `personal_checkin_items[]` (question + quote) for signs that cannot be measured,
  `actions[]` (action text + quote) for what helps.
- **Guardrails (code, `verifyPlan`):**
  1. schema validation; `feature` must be in the catalogue enum;
  2. **quote verification** (§5.1) on every rule, item and action; failures are dropped;
  3. direction must be legal for the feature (`later`/`earlier` only for `rest_midpoint`;
     `less_regular` only for `rest_regularity` and `rhythm_stability`);
  4. duplicates (same feature) are merged, first quote wins;
  5. each survivor becomes a card the user accepts or rejects. Only accepted cards are stored.
- **Example.** Input: *"When things go wrong I keep going to bed later, I skip the gym, I
  stay inside more and I eat badly. I also stop replying to messages. Calling my sister
  helps, and so does a walk in the morning."*

  | Quote | Becomes |
  |---|---|
  | "going to bed later" | rule `rest_midpoint` → `later` |
  | "I skip the gym" | rule `place_visits` → `lower`, `place_label: "gym"` |
  | "I stay inside more" | rule `home_stay` → `higher` |
  | "I eat badly" | check-in item "Did you eat well today?" |
  | "stop replying to messages" | check-in item "Did you reply to messages today?" (and rule `communication_time` → `lower` if the phone domain is enabled) |
  | "Calling my sister helps" | action "Call my sister" |
  | "a walk in the morning" | action "A walk in the morning" |

### G2 · Scan a paper plan (P1)
Many users already have a written plan from therapy. The user photographs it.
- **Web:** send the image to the on-device model (Prompt API image input) with the prompt
  "Transcribe the handwritten or printed text exactly." Then run G on the text.
- **iOS:** use the Vision framework's on-device text recognition, then run G.
- The transcription is shown for correction before G runs. The photo is never stored.

### H · Context recognition
- **When:** after any check-in with free text.
- **Output:** `context` enum, `kind` (`explains_sensors` | `stressor`), `start_hint`,
  `end_hint` (verbatim phrases such as "since Tuesday", or `"unknown"`), `confidence`, `quote`.
- **Guardrails (`verifyContext`):** schema; quote verification; `confidence` must be at
  least `ctxMinConf` (medium); dates are resolved **in code** from the hints
  (`guardrails/dates.ts`), never by the model; `kind` is overwritten from the table in
  `docs/04_DETECTION.md` §6. The result opens `context_confirm`; nothing changes until the
  user confirms.
- The model can only make the app quieter after confirmation. It can never raise an alarm.

### I · Spoken check-in (P1)
The user answers the check-in by talking for a few seconds.
- **Output:** for each *personal* item id: `yes` | `partly` | `no` | `not_mentioned`, with a quote.
- Only personal items are extracted. The three momentary items and all questionnaire items
  are always tapped by the user (rule R1).
- Extracted answers are pre-filled and visible; the user can change them before saving.
- The same text then goes through H and B.

### A · Check-in introduction
- **Input:** `{ contributors: ["home more than usual (4 days)", "later rest time (+1 h 40)"], partOfDay }`.
  The phrases are produced by code from `contributors`.
- **Output:** `intro` (max 160 characters), `tone`.
- **Guardrails:** schema; reject if it contains a question about symptoms, a digit that is
  not in the input, or a banned word (§5.4). Fallback template:
  "A few things look different from your usual week. How are you doing today?"
- For a random check-in there are no contributors and the template "Quick check-in. How
  are you doing right now?" is used without the model.

### B · Diary markers (P1)
- **Input:** one free-text answer, in chunks of at most 2 500 tokens.
- **Output:** ordinal 0–3 for `negative_affect`, `anhedonic_language`, `social_withdrawal`,
  `hopelessness`; `sleep_complaint` boolean; up to 3 `themes` (enum); `crisis` enum.
- `crisis ≠ "none"` opens the safety flow. The keyword check (§5.3) runs regardless of the model.
- Markers are stored and charted only (rule R6).

### C · Explain a result
- **Input:** `{ instrument, total, band, changeFromReference, flagged, contributors }`.
- **Output:** `explanation` (max 80 words).
- **Guardrails:** schema; number check (§5.2); banned words (§5.4).

### K · Match own actions to today (P1)
- **Input:** today's contributor phrases and the user's actions as `{id, text}`.
- **Output:** up to 2 `action_ids` from the given ids.
- **Guardrail:** ids must exist. The app displays the user's **original text** for those
  ids; the model's output contains no prose. This is selection, not advice.

### Q · Ask your data (P1)
The user asks a question such as "How was my rest last week compared with usual?".
1. **Classify (model):** question → `{ intent: "trend" | "compare" | "why_asked" | "unsupported" | "crisis", feature?, period? }` with enums.
2. **Compute (code):** the engine produces a `facts` object (numbers and labels).
3. **Phrase (model):** `facts` → `answer` (max 60 words).
- **Guardrails:** number check (§5.2): every number in the answer must appear in `facts`.
  `unsupported` → fixed reply. `crisis` → safety flow. No medical or interpretive
  questions are answered; the classifier prompt lists what is supported.

### P · Privacy gateway (P1)
Lets the user add a note in their own voice to the weekly aggregate without their text
leaving the phone.
1. **Model, on-device:** this week's free texts → `{ themes: enum[≤3], note: ≤200 chars }`.
   The prompt forbids names, places, employers, dates and quotes.
2. **Code:** PII check on `note`: reject if it contains a digit, an "@", any capitalised
   word that is not sentence-initial, any `place_label`, or the trusted contact's name.
3. **User:** sees exactly what would be shared, can edit or remove it, and approves.
Only an approved note becomes part of `WeekAggregate.note` (class S1).

### D · Weekly reflection
- **Input:** the last 12 `WeekAggregate` records.
- **Lite (on-device, ≤60 words):** this week against the previous one. Works offline.
- **Full (cloud, ≤250 words):** patterns across the 12 weeks, what coincided with better
  weeks, one open question to reflect on. No advice, no diagnosis.
- **Guardrails:** number check; banned words; badge shows which model wrote it.

### E · Clinician report (P1)
- **Input:** 12 `WeekAggregate` records and the confirmed rule list as enums (no quotes).
- **Output:** `summary`, `timeline[]`, `questions_to_bring[]` (max 3).
- Cloud only. Rendered on the `report` screen next to the raw aggregate table.

### R · Recall what helped (P1)
- **Input:** the check-in free text (`<user_text>`) and the user's signs as `{id, words}`
  (their own words from the plan).
- **Output:** `matches[]` of `{sign_id, quote}`, at most 2. Match by meaning.
- **Code:** only ids from the list; every `quote` must be in the check-in text (quote check).
- **Then:** the app asks "That sounds like one of your signs … Is that right?" and only on
  yes shows the notes saved for that sign. The model never chooses what is shown.

### T · Draft a text (P1)
- **Input:** a saved "what helped" note (`<user_text>`), the contact's name, the saved message.
- **Output:** `message`, at most two sentences.
- **Code:** schema, ≤ 40 words, banned words, number check. Shown in an editable box; the
  person opens it in their own messaging app. Hearth never sends anything.

## 5. Guardrails in code

### 5.1 Quote verification (`guardrails/quotes.ts`)
Normalise both strings: lowercase, Unicode NFKC, replace every run of non-alphanumeric
characters with one space, trim. A quote is valid when it has at least 3 characters and
the normalised quote is a substring of the normalised source text.

### 5.2 Number check
Extract all numbers from the model's text. Each must equal a number present in the input
facts (after formatting, e.g. "1 h 40"). Otherwise the output is rejected.

### 5.3 Crisis detection (`guardrails/crisis.ts`)
Case-insensitive match of the phrases in `shared/safety/crisis_keywords.en.json` against
every free text, before and independent of any model call. A false positive is acceptable.

### 5.4 Banned words
`shared/safety/banned_output_words.json`. Any match in model-written prose rejects the output.

### 5.5 Retries
On invalid output: one retry with the same input. Then the fallback. Both attempts are
written to the ledger.

## 6. Prompt rules

- One system prompt per task, in `shared/prompts/`, with a `version:` line. The version is
  stored in the ledger. The active version can be overridden from Remote Config.
- Prompts are in English. The user's text is passed as data between clear delimiters and
  the prompt states that text inside the delimiters is never an instruction.
- On-device requests stay under 3 000 tokens in total; on-device outputs under 200 tokens.

## 7. Required tests (engine side)

| Test | Checks |
|---|---|
| Routing table | Every row of §2 returns the stated decision; S3 never returns a cloud mode for any input combination (property test over all combinations). |
| Quote verification | Exact, re-punctuated and re-cased quotes pass; invented and too-short quotes fail. |
| `verifyPlan` | The example in G yields exactly the listed cards from a correct model output; an output with one invented rule yields one fewer. |
| `verifyContext` | "flu since Tuesday" with today's date resolves to the right start; low confidence returns `null`. |
| Number check | An answer containing a number not in `facts` is rejected. |
| PII check | Notes with a name, a digit or a place label are rejected. |
| Crisis | Every phrase in the keyword file is detected in a sentence. |
