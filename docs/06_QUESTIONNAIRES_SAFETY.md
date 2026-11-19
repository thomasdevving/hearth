# 06 · Questionnaires and safety

## 1. Rules

- Items, stems and answer options are rendered **verbatim** from `shared/questionnaires/*.json`
  (rule R1). One item per page, stem repeated on every page.
- No model output appears on a questionnaire page. The task A intro is on the page before.
- Scoring is `scoreQuestionnaire` in the engine. The model never sees individual answers,
  only the total, band and change, for task C.
- Before release, check the PHQ wording against the official text at phqscreeners.com.

## 2. Instruments

| Instrument | Items | Window | Score | Role |
|---|---|---|---|---|
| PHQ-2 | 2 | 2 weeks | 0–6 | First step after a persistent change |
| PHQ-9 | 9 | 2 weeks | 0–27 | Follow-up after a positive PHQ-2; onboarding reference |
| Momentary items | 3 scales + company + personal items | right now | 1–7 each | Check-ins |
| GAD-2 (P2) | 2 | 2 weeks | 0–6 | Asked with PHQ-2 to form the PHQ-4 |
| WHO-5 (P2) | 5 | 2 weeks | 0–100 | Every two weeks |

P2 instruments are added as JSON files; the questionnaire screen needs no code change.

## 3. Scoring and decisions

### 3.1 PHQ-2
`total ≥ phq2Cutoff` (3) → positive → action `offer_questionnaire PHQ9`. Otherwise the
result page says the answers are in the usual range and the state logic continues.

### 3.2 PHQ-9 reference score
The cut-off of 10 is a screening threshold for people who have not been assessed. For
someone in remission, a clear rise from their own level also matters.

```
remissionScore = median of the PHQ-9 totals that were not flagged, in the last 180 days
               = the onboarding PHQ-9 total until a second one exists
```

### 3.3 PHQ-9 decision
```
flagged = total ≥ phq9Cutoff (10)  OR  total − remissionScore ≥ phq9ReliableChange (5)
```

| Result | App does |
|---|---|
| Not flagged | Result page with task C. If the state was `CONFIRMED`, it returns to `MONITOR`. |
| Flagged | State → `CONFIRMED`. Result page, `my_plan`, and a suggestion to share the report with their clinician or GP. PHQ-9 is offered again after `phq9IntervalDays`. |
| Item 9 > 0 | Safety flow **first** (§4), whatever the total. The result is still saved. |

### 3.4 Onboarding PHQ-9 at or above 10
The app says plainly that it is built for people who are currently doing fairly well, that
their answers suggest now may be a good moment to talk to their GP or clinician, and
continues in state `CONFIRMED`. It does not block use.

### 3.5 `QuestionnaireResult`
```ts
interface QuestionnaireResult {
  id: QuestionnaireId
  total: number
  band: string | null            // PHQ-9 only
  positive: boolean              // PHQ-2
  flagged: boolean               // PHQ-9
  changeFromReference: number | null
  safetyItemPositive: boolean    // PHQ-9 item 9 > 0
  nextStep: "none" | "offer_phq9" | "show_plan_and_share" | "safety"
}
```

## 4. Safety flow

### 4.1 Entry points
1. PHQ-9 item 9 answered above 0.
2. `detectCrisis` matches any free text (check-in, plan, ask-your-data question).
3. Task B returns `crisis: "explicit"`, or task Q classifies a question as `crisis`.
   Task B `crisis: "possible"` shows support in place instead (§4.4).
4. The user taps "I need help now", which is on `home` and `settings` at all times.

### 4.2 The `safety` screen
Shown full-screen, immediately, with no network needed:
1. A short, calm line: "It sounds like things are very hard right now. You don't have to
   handle this alone."
2. The crisis line for the user's country from `shared/safety/crisis_lines.json`, with a
   call button, and the emergency text.
3. The trusted contact, if set, with call and message buttons.
4. The user's own safety plan, if they filled it in (free text: my warning signs, what
   helps me, who I can call). It is stored locally and is class S3.
5. A "Back" button that only becomes active after the resources have been on screen for
   3 seconds.

### 4.3 Rules
- Not maskable by context labels, quiet hours, prompt limits or snooze (rule R7).
- No model call is made on this screen.
- The app never says it has notified anyone, and never implies it monitors the user for
  safety. It is not a crisis service and says so in onboarding.
- Opening the flow is logged locally only (`safety_events`), never uploaded.
- No risk scoring: the app does not administer the C-SSRS or classify risk.

### 4.4 Support in place (task B `possible`)
A small on-device model is often unsure, and "when unsure choose possible" would otherwise put
ordinary low-mood text on the full-screen safety page; frequent takeovers scare people and
teach them to ignore it. So for `possible` (and only when no keyword matched):
- A support card appears on the screen the person is on (the check-in's thanks screen, and on
  `home` until closed): a calm line, the crisis line for their country with a call button,
  the trusted contact if set, the emergency text, and links to their safety plan and to the
  full support screen.
- "I'm OK for now" becomes active only after the card has been visible for 3 seconds (R7).
- Logged locally as `model_possible`. Keyword hits, `explicit`, PHQ-9 item 9 and the button
  still open the full screen (§4.2).
Decided by the project owner on 2026-11-19; to be reviewed with a clinician.

## 5. Required tests

| Test | Checks |
|---|---|
| PHQ-2 | Totals 0–6; positive from 3. |
| PHQ-9 bands | 4 → minimal, 5 → mild, 10 → moderate, 15 → moderately_severe, 20 → severe. |
| Reliable change | Reference 2, total 7 → flagged; reference 2, total 6 → not flagged; total 10 → flagged whatever the reference. |
| Reference | Median of unflagged totals; flagged totals do not move it. |
| Item 9 | Any non-zero answer sets `safetyItemPositive` and `nextStep: "safety"`. |
| Verbatim | A snapshot test of the rendered PHQ-9 page equals the JSON text character for character. |
