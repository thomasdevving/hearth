import SwiftUI

/// "The science behind Hearth" (web: apps/web/src/screens/Science.tsx): the research each signal
/// rests on, the formulas the engine uses (with the live config values), what we measured, and
/// what we do not claim. Research findings are described in the words of the studies; nothing
/// here says anything about the person using the app (rule R9).
struct ScienceView: View {
  #if DEBUG
  /// `-HearthScrollMiddle YES` starts in the middle of the page, `-HearthScrollBottom YES` at the end (screenshots).
  private static var debugAnchor: UnitPoint? { UserDefaults.standard.bool(forKey: "HearthScrollMiddle") ? UnitPoint(x: 0.5, y: 0.42) : WhyView.debugAnchor }
  #else
  private static let debugAnchor: UnitPoint? = nil
  #endif

  private static let config = SciConfig()
  private var c: SciConfig { Self.config }

  var body: some View {
    ScreenScroll(title: "The science behind Hearth", anchor: Self.debugAnchor) {
      intro
      whyItMatters
      signals
      math
      safeguards
      questionnaires
      ai
      measured
      Group {
        unknown
        next
      }
      sources
    }
  }

  // Intro -------------------------------------------------------------------------------

  @ViewBuilder private var intro: some View {
    Text("Research & evidence")
      .font(HearthFont.body(13, weight: "SemiBold")).foregroundStyle(Theme.muted)
    SciPara("Hearth compares you only with you. It learns what your usual days look like, notices when they drift, and then asks you, in a few taps, how you are. It gives no diagnosis. This page shows the research each part rests on, the exact formulas, and what we measured, including what did not work.")
  }

  @ViewBuilder private var whyItMatters: some View {
    SectionTitle(text: "Why it matters")
    SciRich(
      Text("About 332 million people live with depression worldwide") + sciCite(["who"])
      + Text(", and at least half of those who recover from a first episode have another") + sciCite(["burcusa"])
      + Text(". Clinicians already write early-warning plans with their patients: the idea of a personal \"relapse signature\" comes from psychosis research, where people and their families learned to spot their own first signs") + sciCite(["birchwood"])
      + Text(". Hearth helps such a plan work between appointments.")
    )
  }

  // Signals -----------------------------------------------------------------------------

  @ViewBuilder private var signals: some View {
    SectionTitle(text: "The signals, and the research behind them")
    Muted("Each finding is an association in groups of people. None of them can tell, on its own, how one person is doing. That is why Hearth only looks for change against your own usual days.")
    VStack(alignment: .leading, spacing: 16) {
      SciSignal(
        title: "Activity",
        found: "Across 49 prospective studies with 266,939 people, those with high physical activity had lower odds of later depression (adjusted odds ratio 0.83).",
        cites: ["schuch"],
        inHearth: "Steps, active hours (hours with at least \(c.n("activeHourSteps")) steps) and walking speed.")
      SciDivider()
      SciSignal(
        title: "Daily rhythm",
        found: "In 91,105 people wearing an activity tracker, a flatter day-night rhythm (lower relative amplitude) went with more lifetime major depression and bipolar disorder, more mood instability and more loneliness. Social rhythm theory explains why: daily anchors such as getting up, meals and meeting people keep the body clock steady.",
        cites: ["lyall", "ehlers", "vansomeren"],
        inHearth: "Rhythm stability (IS), fragmentation (IV) and relative amplitude (RA), from hourly steps over 7 days.")
      SciDivider()
      SciSignal(
        title: "Sleep and rest",
        found: "Across 21 long-term studies, people with insomnia had about twice the odds of developing depression later (pooled odds ratio 2.1).",
        cites: ["baglioni"],
        inHearth: "Sleep length, its midpoint (how late) and how regular it is, from a watch when you wear one. Without a watch, Hearth uses the longest still period of the phone at night and calls it \"rest\", not \"sleep\".")
      SciDivider()
      SciSignal(
        title: "Heart",
        found: "Across studies, people with depression had lower heart rate variability, and lower with more severe symptoms. In 510 people with recurrent depression followed for two years with a Fitbit, changes in resting heart rate by day and night went with more severe symptoms.",
        cites: ["kemp", "siddi"],
        inHearth: "Overnight heart rate variability (lower is the concern) and resting heart rate (higher is the concern), from a watch. Illness moves both, so marking yourself ill sets them aside.")
      SciDivider()
      SciSignal(
        title: "Places and movement",
        found: "In a two-week phone study, a regular 24-hour movement pattern (r = −0.63) and time spread over more places went with lower symptom scores. A later study found that changes in GPS features came before changes in symptoms, not the other way round.",
        cites: ["saeb", "meyerhoff"],
        inHearth: "Time at home, location entropy, places visited, location variance, routine regularity, and visits to a place named in your plan (for example the gym). Only on iOS; places stay on the phone.")
      SciDivider()
      SciSignal(
        title: "Phone use",
        found: "In the same phone study, more time on the phone went with higher symptom scores (r = 0.54).",
        cites: ["saeb"],
        inHearth: "Screen time, night use and time in messaging apps. Off by default; counted in coarse steps only.")
      SciDivider()
      SciSignal(
        title: "Your own words",
        found: "Language in posts predicted a later depression diagnosis in medical records, up to three months ahead (AUC 0.69), and absolutist words such as \"always\" and \"nothing\" are more common in forums about anxiety and depression.",
        cites: ["eichstaedt", "almosaiwi"],
        inHearth: "Shown in Trends for reflection only. Words never enter the index: they estimate how someone is overall, but track change within one person poorly. They are analysed on the device only.")
      SciDivider()
      SciSignal(
        title: "Compared with yourself, not others",
        found: "Models trained on one group of people predicted poorly for new groups. Behaviour differs too much between people to judge one person against a population.",
        cites: ["globem"],
        inHearth: "Every number is compared with your own last \(c.n("baselineWindowDays")) ordinary days.")
    }
  }

  // Formulas ----------------------------------------------------------------------------

  @ViewBuilder private var math: some View {
    SectionTitle(text: "How a day becomes one number")
    SciPara("All of this is plain code in the engine, the same in the browser, in tests and on iOS. The language model never computes a number. The values below are the settings this app is running with.")

    SciH3("1. Compare each signal with your usual days")
    SciPara("For each signal j, the reference set R is your most recent \(c.n("baselineWindowDays")) eligible days (at least \(c.n("minReferenceDays")); weekdays against weekdays once \(c.n("minSameDayType")) exist). A robust z-score uses the median and the median absolute deviation, so one odd day cannot shift your baseline:")
    SciFormula([
      "z_j = (x_j − median(R))",
      "      / (1.4826 · MAD(R) + floor_j)",
      "z_j is kept between −4 and 4",
    ])
    SciPara("Days on which the index was already raised are not eligible. This is what stops a slow decline from becoming the new normal.")

    SciH3("2. Keep only change in the direction that matters")
    SciFormula([
      "higher is the concern:  r = max(0, z)",
      "lower is the concern:   r = max(0, −z)",
      "both ways:              r = max(0, |z| − 1)",
      "r is capped at 3",
    ])
    SciPara("A sign from your own plan sets the direction and counts \(c.n("personalWeight"))× in its group.")

    SciH3("3. Average within a group, then across groups")
    SciFormula([
      "G_k = Σ a_j · r_j / Σ a_j",
      "      over the signals in group k",
      "D   = Σ u_k · G_k / Σ u_k",
      "      over the groups present",
      "      (at least \(c.n("minDomains")) groups)",
      "u_k = 1 until Hearth has learned",
      "      your own weights (step 6)",
    ])
    SciPara("The groups are activity, rhythm, sleep, heart, places and phone. Signals inside one group move together, so they are averaged and four changing movement signals count as one change, not four.")

    SciH3("4. Watch the trend, not one day")
    SciFormula([
      "S_d = λ·D_d + (1 − λ)·S_(d−1)    λ = \(c.n("ewmaLambda"))",
      "UCL = μ0 + L·σ0·√(λ / (2 − λ))   L = \(c.n("ewmaL"))",
      "C_d = max(0, C_(d−1) + (D_d−μ0)/σ0 − k)",
      "                                 k = \(c.n("cusumK"))",
      "changed when S_d > UCL or C_d > \(c.n("cusumH"))",
      "σ0 is at least \(c.n("sigmaFloor"))",
    ])
    SciPara("The EWMA (S) reacts to a clear shift within days; the CUSUM (C) adds up small, steady deviations that no single day would show. Both come from statistical process control. μ0 and σ0 are the mean and spread of D over your ordinary days.")

    SciH3("5. What happens next")
    VStack(alignment: .leading, spacing: 8) {
      SciListRow(marker: "1.", text:
        Text("Learning your pattern").font(HearthFont.body(16, weight: "SemiBold"))
        + Text(" until \(c.n("minReferenceDays")) days of D exist, then ")
        + Text("Steady").font(HearthFont.body(16, weight: "SemiBold"))
        + Text("."))
      SciListRow(marker: "2.", text:
        Text("Changed").font(HearthFont.body(16, weight: "SemiBold"))
        + Text(" after one day above the limit: a short check-in, and your plan opens. Back to Steady after \(c.n("recoveryDays")) ordinary days."))
      SciListRow(marker: "3.", text:
        Text("A PHQ-2 is offered only if the change persists (\(c.n("persistDays")) of \(c.n("persistWindow")) days on one-day signals), or if 2 of your last 3 check-ins were low, or if you have left clearly more check-ins unanswered than usual (step 7), or if your baseline itself has drifted more than \(c.n("driftThreshold")) spread from where it started."))
      SciListRow(marker: "4.", text:
        Text("A PHQ-9 that reaches \(c.n("phq9Cutoff")) keeps the plan and the share option in view until a later one does not."))
    }

    SciH3("6. Learn which groups go with your low days")
    SciPara("Not everyone's low days show up in the same place: for one person it is sleep, for another it is staying home. So Hearth learns, per person, how much each group counts. It learns only from the random check-ins: the triggered ones were chosen by the current weights, so learning from them would only confirm what the model already does. Each answered random check-in is one example: your answer to \"Right now, I feel down\" (1 to 7) and, for each group, its average over that day and the \(c.minus1("weightSampleDays")) days before.")
    SciFormula([
      "y   = \"I feel down\" on a random check-in",
      "x_k = mean of G_k over that day and",
      "      the \(c.minus1("weightSampleDays")) days before",
      "",
      "ŷ   = a + Σ_k β_k · x_k",
      "β   = argmin Σ (y − ŷ)² + λ · Σ_k (β_k − β̄)²",
      "      β̄ = mean of the β_k",
      "λ   = \(c.n("weightShrinkage")) · trace(XᵀX) / K",
      "",
      "u_k = β_k / β̄, kept between \(c.n("weightMin")) and \(c.n("weightMax")),",
      "      rescaled so the mean stays 1",
    ])
    SciPara("This is ridge regression with one change: the penalty pulls every slope towards the slopes' common mean instead of towards zero. With few answers all slopes come out nearly equal and every group keeps weight 1; only a link that keeps showing up pulls them apart. The result is still a weighted average, so \"Why?\" can still name the signal behind every alert.")
    VStack(alignment: .leading, spacing: 8) {
      SciListRow(marker: "•", text:
        Text("Enough answers.").font(HearthFont.body(16, weight: "SemiBold"))
        + Text(" At least \(c.n("weightMinSamples")) random check-ins (at one in three days, about two months), at most \(c.n("weightMaxSamples")) from the last \(c.n("weightWindowDays")) days."))
      SciListRow(marker: "•", text:
        Text("The alerts must mean something.").font(HearthFont.body(16, weight: "SemiBold"))
        + Text(" The self-test below must say the triggered check-ins are informative for you."))
      SciListRow(marker: "•", text:
        Text("It must predict better.").font(HearthFont.body(16, weight: "SemiBold"))
        + Text(" Leave-one-out: each check-in is predicted by a model fitted on all the others. The weighted model must predict \"I feel down\" at least \(c.percent("weightMinGain"))% better (squared error) than one with equal weights. Once the weights are on, not worse is enough, so they do not switch on and off."))
      SciListRow(marker: "•", text:
        Text("Slow and steady.").font(HearthFont.body(16, weight: "SemiBold"))
        + Text(" Weights move at most \(c.n("weightMaxStep")) a week towards the new fit, and stay put while your days look changed, like your usual range. That range is recomputed with the same weights, so a change of weights never moves the limit by itself."))
    }
    SciPara("Trends shows what Hearth has learned for you, or how many check-ins it still needs.")

    SciH3("7. Notice when check-ins go unanswered")
    SciPara("Leaving check-ins unanswered more often than usual can itself be an early sign that things are getting harder; a recent review of phone-based depression prediction points to one study where it was. So silence is not only a reason to ask less. Hearth compares the share you left in the last \(c.n("responseRecentDays")) days with your own usual share before that.")
    SciFormula([
      "recent = check-ins of the last \(c.n("responseRecentDays")) days",
      "usual  = check-ins before that,",
      "         up to \(c.n("responseUsualDays")) days back",
      "         (confirmed holiday, trip or illness",
      "          days left out)",
      "",
      "q = (left_usual + 1) / (n_usual + 2)",
      "p = P(X ≥ left_recent),",
      "    X ~ Binomial(n_recent, q)",
      "",
      "fewer answers when",
      "  left_recent ≥ \(c.n("responseMinMissed")),",
      "  left_recent / n_recent − q ≥ \(c.n("responseMinRise"))",
      "  and p < \(c.n("responseAlpha"))",
    ])
    VStack(alignment: .leading, spacing: 8) {
      SciListRow(marker: "•", text:
        Text("Your own usual.").font(HearthFont.body(16, weight: "SemiBold"))
        + Text(" Someone who often leaves a check-in is compared with that, not with someone who answers every one. It starts after \(c.n("responseMinUsual")) earlier check-ins and \(c.n("responseMinRecent")) recent ones; today's check-in never counts, since you may still answer it."))
      SciListRow(marker: "•", text:
        Text("Two short questions, nothing more.").font(HearthFont.body(16, weight: "SemiBold"))
        + Text(" When it fires, Hearth offers a PHQ-2, with the same \(c.n("phq2CooldownDays"))-day pause as the other reasons. It does not change D or the state: leaving a check-in says nothing about one day's routine."))
      SciListRow(marker: "•", text:
        Text("Asking less, later.").font(HearthFont.body(16, weight: "SemiBold"))
        + Text(" Hearth still halves its check-in chances after \(c.n("ignoredBeforeBackoff")) unanswered in a row, until you answer one. It used to do that after 2, which often left too few check-ins to notice it in time."))
    }

    // One line between two folds, not two (as on Plan).
    VStack(alignment: .leading, spacing: 0) {
      Fold(title: "Rhythm formulas (van Someren)") {
        SciFormula([
          "x_i = hourly steps over 7 days, mean x̄",
          "x̄_h = mean for hour of day h, p = 24",
          "",
          "IS = n·Σ_h(x̄_h − x̄)²",
          "     / (p·Σ_i(x_i − x̄)²)",
          "IV = n·Σ(x_i − x_(i−1))²",
          "     / ((n − 1)·Σ_i(x_i − x̄)²)",
          "RA = (M10 − L5) / (M10 + L5)",
          "",
          "IS: 0 to 1, higher is steadier",
          "IV: higher is more broken up",
          "M10: the most active 10 hours",
          "L5: the least active 5 hours",
        ])
        Muted("Needs at least 5 of the 7 days with steps. A day with fewer than \(c.n("minDailySteps")) steps counts as \"phone not carried\".")
      }
      .padding(.bottom, -1)
      Fold(title: "Movement formulas") {
        SciFormula([
          "t_k = minutes at place k,  T = Σ t_k",
          "(needs \(c.n("minKnownMinutes")) known minutes; places",
          " within \(c.n("placeRadiusM")) m count as one place)",
          "",
          "home     = t_home / T",
          "entropy  = −Σ (t_k/T)·ln(t_k/T) / ln N",
          "variance = log10(1 + Σ (t_k/T)·d_k²)",
          "  d_k: metres from the day's centre",
          "routine  = hours at your usual place",
          "  for that hour / comparable hours",
        ])
      }
      .padding(.bottom, -1)
      Fold(title: "Language counts (display only)") {
        SciFormula([
          "Needs 20+ words; W = word count",
          "FPS = share of i, me, my, myself …",
          "OTH = share of you, he, she, we …",
          "self-focus = FPS / (FPS + OTH)",
          "absolutist = 19 words such as always,",
          "  never and nothing, counted / W",
        ])
      }
    }
  }

  // Safeguards, questionnaires, AI --------------------------------------------------------

  @ViewBuilder private var safeguards: some View {
    SectionTitle(text: "What keeps it from crying wolf")
    VStack(alignment: .leading, spacing: 8) {
      SciListRow(marker: "•", text:
        Text("Life is not a warning sign.").font(HearthFont.body(16, weight: "SemiBold"))
        + Text(" When you confirm a holiday, travel, visitors or illness, the signals it explains are set aside for those days (up to \(c.n("contextMaxDays")) days, then Hearth asks once more)."))
      SciListRow(marker: "•", text:
        Text("Stress is not hidden.").font(HearthFont.body(16, weight: "SemiBold"))
        + Text(" Exams, a new job or a loss are noted but never set aside: these are the times early signs matter most."))
      SciListRow(marker: "•", text:
        Text("Few questions.").font(HearthFont.body(16, weight: "SemiBold"))
        + Text(" At most \(c.n("maxCheckinsPerDay")) check-in a day and \(c.n("maxCheckinsPerWeek")) a week. After \(c.n("ignoredBeforeBackoff")) unanswered ones Hearth asks less."))
      SciListRow(marker: "•", text:
        Text("A test of itself.").font(HearthFont.body(16, weight: "SemiBold"))
        + Text(" Some check-ins come at random (chance \(c.percent("randomCheckinProb"))%), and you are not told which kind you got. After \(c.n("auditMinPerGroup"))+ of each, Hearth compares your answers with a permutation test: if the triggered ones are not lower than the random ones, it tells you the triggers are not informative for you and offers a fixed schedule instead. This borrows the idea of micro-randomised trials")
        + sciCite(["klasnja", "nahum"])
        + Text("."))
    }
  }

  @ViewBuilder private var questionnaires: some View {
    SectionTitle(text: "The questionnaires")
    SciRich(
      Text("The PHQ-2 and PHQ-9 are shown word for word, never rewritten by a model. A PHQ-2 of \(c.n("phq2Cutoff")) or more leads to the PHQ-9") + sciCite(["manea"])
      + Text(". A PHQ-9 of \(c.n("phq9Cutoff")) or more has a sensitivity of 0.88 and specificity of 0.85 against clinical interviews") + sciCite(["levis"])
      + Text(", and a change of \(c.n("phq9ReliableChange")) points is counted as a real change") + sciCite(["lowe", "jacobson"])
      + Text(". Any answer above 0 on item 9 opens the support screen straight away, offline too.")
    )
  }

  @ViewBuilder private var ai: some View {
    SectionTitle(text: "What the AI does, and what it may not do")
    VStack(alignment: .leading, spacing: 8) {
      SciListRow(marker: "•", text: Text("It turns your own description of your early signs into cards, writes the opening line of a check-in, reads a note for context (\"I'm in Spain this week\"), picks which of your own actions fit today, and answers questions about your data from numbers the engine supplies."))
      SciListRow(marker: "•", text: Text("It never computes a score, a limit or a trigger, and never rewrites a questionnaire item."))
      SciListRow(marker: "•", text: Text("Every output is checked in code: it must match a schema, every quote must appear in what you wrote, every number must come from the engine, and diagnostic words are rejected. If a check fails, a fixed text is used instead."))
      SciListRow(marker: "•", text: Text("Your words, notes and places are handled only by the model on your device. If there is none, simple rules take over: they never go to the cloud. Each call is listed in the privacy ledger with exactly what was sent."))
    }
  }

  // Results -----------------------------------------------------------------------------

  private static let results: [(question: String, result: String)] = [
    ("Days from the start of a decline to \"Changed\"", "median 7 (range 3–8) over 50 simulated people; none missed"),
    ("Same, for a slower decline", "median 12 (6–16); none missed"),
    ("False alarms on stable data (150 days, 50 people)", "1.03 \"Changed\" days per 100 days; 39 of 50 had none, the highest had 12 (2.59 before sleep and heart data from a watch were added)"),
    ("Holiday week, \"Changed\" days (20 people)", "0 when confirmed, 92 when not"),
    ("Effect of the person's own plan", "median 7 days with it, 8 without"),
    ("Personal weights on stable data and on Sam (50 people each)", "never switched on; false alarms and detection unchanged"),
    ("Personal weights, a person whose mood follows activity (20 people)", "switched on before the decline in 10 of 20, with activity weighing most in 9; the decline was seen earlier in 7 and later in 1, at about 0.4 extra \"Changed\" days per 100 days. With no such link: on in 2 of 20, no extra alarms"),
    ("Unanswered check-ins, stable answering (40 people, 180 days)", "0.07 needless PHQ-2 offers per 100 days for someone who usually leaves 10%, 0.32 at 20%, 0.63 at 30%. A confirmed holiday: 4 offers over 40 people, 34 when not confirmed"),
    ("Unanswered check-ins, a person who stops answering (75% left)", "noticed after a median 9 to 13 days; within 4 weeks in 34 to 38 of 40. Sam, who keeps answering: no offers, detection unchanged"),
    ("Requests leaving the browser with the cloud off", "0, and 0 containing your text"),
    ("Crisis sentences opening the support screen (keywords)", "20 of 20, 0 of 20 neutral ones; the list was extended after a first run found 13 of 20, so this is not an unbiased estimate"),
    ("Full demo script holding on every seed", "16 of 20 (target was 18), counting the person's own signs over the first 3 days of the change; 10 of 20 if only the first day counts"),
    ("Gemini Nano reading a plan into cards (35 plans, one run)", "42% of proposed signals right (target 80%), 44% of expected ones found; every card waits for your confirmation"),
    ("Gemini Nano reading a context from a note (30 sentences)", "29 of 30 right"),
    ("Gemini Nano on crisis wording", "20 of 20 crisis sentences flagged; 7 of 30 everyday low-mood texts also flagged as \"possible\", which adds a support card"),
  ]

  @ViewBuilder private var measured: some View {
    SectionTitle(text: "What we measured")
    Muted("On simulated people from the demo, run through the real engine. These are tests of the method, not clinical results.")
    VStack(alignment: .leading, spacing: 12) {
      ForEach(Array(Self.results.enumerated()), id: \.offset) { i, row in
        if i > 0 { SciDivider() }
        VStack(alignment: .leading, spacing: 3) {
          Text(row.question)
            .font(HearthFont.body(15, weight: "SemiBold")).foregroundStyle(Theme.ink)
            .fixedSize(horizontal: false, vertical: true)
          Text(row.result)
            .font(HearthFont.body(16)).foregroundStyle(Theme.ink2)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
      }
    }
  }

  @ViewBuilder private var unknown: some View {
    SectionTitle(text: "What we do not know yet")
    VStack(alignment: .leading, spacing: 8) {
      SciListRow(marker: "•", text: Text("The thresholds have not been tested on real people going through a real decline."))
      SciListRow(marker: "•", text: Text("Personal weights have only been tried on simulated people, and need weeks of answers before they do anything."))
      SciListRow(marker: "•", text: Text("Whether people leave more check-ins unanswered before a relapse rests on one study; in Hearth it has only been tried on simulated answering."))
      SciListRow(marker: "•", text: Text("Rest from phone stillness is a rough stand-in for sleep."))
      SciListRow(marker: "•", text: Text("Without location or a watch, only activity, rhythm and rest are available."))
      SciListRow(marker: "•", text: Text("English only."))
    }
  }

  @ViewBuilder private var next: some View {
    SectionTitle(text: "Signals we could add next")
    Muted("Each has research behind it. Neither is in Hearth yet.")
    VStack(alignment: .leading, spacing: 16) {
      SciSignal(
        title: "Daylight",
        found: "In over 400,000 UK Biobank participants, more time in outdoor light went with fewer depressive symptoms; in 86,772 wearing light sensors, more light at night went with higher risk and more daylight with lower risk.",
        cites: ["burns21", "burns23"],
        inHearth: "Apple Watch records time in daylight; it would join the rhythm group.")
      SciDivider()
      SciSignal(
        title: "Feeling lonely",
        found: "In long-term studies, adults who often felt lonely had about twice the odds of new depression (odds ratio 2.33).",
        cites: ["mann"],
        inHearth: "Not a sensor: a check-in question you could choose to add, alongside \"Who are you with right now?\".")
    }
  }

  // Sources -----------------------------------------------------------------------------

  @ViewBuilder private var sources: some View {
    SectionTitle(text: "Sources")
    VStack(alignment: .leading, spacing: 14) {
      ForEach(Array(sciRefs.enumerated()), id: \.element.id) { i, ref in
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text("\(i + 1).")
            .font(HearthFont.body(15, weight: "SemiBold")).foregroundStyle(Theme.muted)
            .frame(minWidth: 28, alignment: .trailing)
          VStack(alignment: .leading, spacing: 2) {
            Text(ref.text)
              .font(HearthFont.body(15)).foregroundStyle(Theme.ink2)
              .fixedSize(horizontal: false, vertical: true)
            if let url = URL(string: ref.url) {
              Link("Link", destination: url)
                .font(HearthFont.body(15, weight: "Medium"))
                .foregroundStyle(Theme.magenta)
                .frame(minHeight: 44, alignment: .leading)
            }
          }
        }
      }
    }
  }
}

// Config --------------------------------------------------------------------------------

/// The numbers from the engine config (`Shared.configJSON`), printed as JavaScript would.
private struct SciConfig: Sendable {
  private let values: [String: Double]

  init() {
    let dict = JSONText.object(Shared.configJSON) as? [String: Any] ?? [:]
    var out: [String: Double] = [:]
    for (key, value) in dict {
      if let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() { out[key] = n.doubleValue }
    }
    values = out
  }

  func n(_ key: String) -> String {
    guard let v = values[key] else { return "?" }
    return JSONText.number(v)
  }

  /// The value minus one, e.g. "the 2 days before" for a 3-day window.
  func minus1(_ key: String) -> String {
    guard let v = values[key] else { return "?" }
    return JSONText.number(v - 1)
  }

  /// `Math.round(value * 100)`.
  func percent(_ key: String) -> String {
    guard let v = values[key] else { return "?" }
    return JSONText.number((v * 100).rounded(.toNearestOrAwayFromZero))
  }
}

// Sources and citations -----------------------------------------------------------------

private struct SciRef: Sendable {
  let id: String
  let text: String
  let url: String
}

private let sciRefs: [SciRef] = [
  SciRef(id: "schuch", text: "Schuch FB, et al. Physical activity and incident depression: a meta-analysis of prospective cohort studies. Am J Psychiatry 2018;175:631–648.", url: "https://pubmed.ncbi.nlm.nih.gov/29690792/"),
  SciRef(id: "lyall", text: "Lyall LM, et al. Association of disrupted circadian rhythmicity with mood disorders, subjective wellbeing, and cognitive function: a cross-sectional study of 91,105 participants from the UK Biobank. Lancet Psychiatry 2018;5:507–514.", url: "https://doi.org/10.1016/S2215-0366(18)30139-1"),
  SciRef(id: "ehlers", text: "Ehlers CL, Frank E, Kupfer DJ. Social zeitgebers and biological rhythms. Arch Gen Psychiatry 1988;45:948–952.", url: "https://pubmed.ncbi.nlm.nih.gov/?term=Social+zeitgebers+and+biological+rhythms+Ehlers+Frank+Kupfer"),
  SciRef(id: "vansomeren", text: "Van Someren EJW, et al. Bright light therapy: improved sensitivity to its effects on rest-activity rhythms in Alzheimer patients by application of nonparametric methods. Chronobiol Int 1999;16:505–518.", url: "https://pubmed.ncbi.nlm.nih.gov/?term=Van+Someren+bright+light+therapy+nonparametric+rest-activity+rhythms+Alzheimer"),
  SciRef(id: "baglioni", text: "Baglioni C, et al. Insomnia as a predictor of depression: a meta-analytic evaluation of longitudinal epidemiological studies. J Affect Disord 2011;135:10–19.", url: "https://pubmed.ncbi.nlm.nih.gov/?term=Insomnia+as+a+predictor+of+depression+meta-analytic+evaluation+longitudinal+epidemiological+studies"),
  SciRef(id: "saeb", text: "Saeb S, et al. Mobile phone sensor correlates of depressive symptom severity in daily-life behavior: an exploratory study. J Med Internet Res 2015;17(7):e175.", url: "https://doi.org/10.2196/jmir.4273"),
  SciRef(id: "meyerhoff", text: "Meyerhoff J, et al. Evaluation of changes in depression, anxiety, and social anxiety using smartphone sensor features. J Med Internet Res 2021;23(9):e22844.", url: "https://doi.org/10.2196/22844"),
  SciRef(id: "globem", text: "Xu X, et al. GLOBEM: cross-dataset generalization of longitudinal human behavior modeling. Proc ACM IMWUT 2022.", url: "https://homes.cs.washington.edu/~althoff/docs/globem_imwut.pdf"),
  SciRef(id: "birchwood", text: "Birchwood M, et al. Predicting relapse in schizophrenia: the development and implementation of an early signs monitoring system using patients and families as observers. Psychol Med 1989;19:649–656.", url: "https://pubmed.ncbi.nlm.nih.gov/?term=Predicting+relapse+in+schizophrenia+early+signs+monitoring+system+Birchwood"),
  SciRef(id: "eichstaedt", text: "Eichstaedt JC, et al. Facebook language predicts depression in medical records. PNAS 2018;115(44):11203–11208.", url: "https://doi.org/10.1073/pnas.1802331115"),
  SciRef(id: "almosaiwi", text: "Al-Mosaiwi M, Johnstone T. In an absolute state: elevated use of absolutist words is a marker specific to anxiety, depression, and suicidal ideation. Clin Psychol Sci 2018;6(4):529–542.", url: "https://doi.org/10.1177/2167702617747074"),
  SciRef(id: "manea", text: "Manea L, et al. Identifying depression with the PHQ-2: a diagnostic meta-analysis. J Affect Disord 2016;203:382–395.", url: "https://pubmed.ncbi.nlm.nih.gov/27371907/"),
  SciRef(id: "levis", text: "Levis B, Benedetti A, Thombs BD. Accuracy of Patient Health Questionnaire-9 (PHQ-9) for screening to detect major depression: individual participant data meta-analysis. BMJ 2019;365:l1476.", url: "https://pubmed.ncbi.nlm.nih.gov/30967483/"),
  SciRef(id: "lowe", text: "Löwe B, et al. Monitoring depression treatment outcomes with the Patient Health Questionnaire-9. Med Care 2004;42(12):1194–1201.", url: "https://pubmed.ncbi.nlm.nih.gov/?term=Monitoring+depression+treatment+outcomes+with+the+patient+health+questionnaire-9"),
  SciRef(id: "jacobson", text: "Jacobson NS, Truax P. Clinical significance: a statistical approach to defining meaningful change in psychotherapy research. J Consult Clin Psychol 1991;59:12–19.", url: "https://pubmed.ncbi.nlm.nih.gov/?term=Clinical+significance+statistical+approach+meaningful+change+psychotherapy+research+Jacobson+Truax"),
  SciRef(id: "nahum", text: "Nahum-Shani I, et al. Just-in-time adaptive interventions (JITAIs) in mobile health. Ann Behav Med 2018;52:446–462.", url: "https://pubmed.ncbi.nlm.nih.gov/?term=Just-in-Time+Adaptive+Interventions+JITAIs+in+Mobile+Health+Nahum-Shani"),
  SciRef(id: "klasnja", text: "Klasnja P, et al. Microrandomized trials: an experimental design for developing just-in-time adaptive interventions. Health Psychol 2015;34(S):1220–1228.", url: "https://pubmed.ncbi.nlm.nih.gov/?term=Microrandomized+trials+experimental+design+just-in-time+adaptive+interventions+Klasnja"),
  SciRef(id: "burcusa", text: "Burcusa SL, Iacono WG. Risk for recurrence in depression. Clin Psychol Rev 2007;27:959–985.", url: "https://doi.org/10.1016/j.cpr.2007.02.005"),
  SciRef(id: "who", text: "World Health Organization. Depressive disorder (depression), fact sheet, 29 August 2025.", url: "https://www.who.int/news-room/fact-sheets/detail/depression"),
  SciRef(id: "kemp", text: "Kemp AH, et al. Impact of depression and antidepressant treatment on heart rate variability: a review and meta-analysis. Biol Psychiatry 2010;67:1067–1074.", url: "https://pubmed.ncbi.nlm.nih.gov/20138254/"),
  SciRef(id: "siddi", text: "Siddi S, et al. The usability of daytime and night-time heart rate dynamics as digital biomarkers of depression severity. Psychol Med 2023;53(8):3249–3260.", url: "https://doi.org/10.1017/S0033291723001034"),
  SciRef(id: "burns21", text: "Burns AC, et al. Time spent in outdoor light is associated with mood, sleep, and circadian rhythm-related outcomes: a cross-sectional and longitudinal study in over 400,000 UK Biobank participants. J Affect Disord 2021;295:347–352.", url: "https://doi.org/10.1016/j.jad.2021.08.056"),
  SciRef(id: "burns23", text: "Burns AC, et al. Day and night light exposure are associated with psychiatric disorders: an objective light study in >85,000 people. Nat Ment Health 2023.", url: "https://doi.org/10.1038/s44220-023-00135-8"),
  SciRef(id: "mann", text: "Mann F, et al. Loneliness and the onset of new mental health problems in the general population. Soc Psychiatry Psychiatr Epidemiol 2022.", url: "https://pubmed.ncbi.nlm.nih.gov/35583561/"),
]

/// "[1, 2]" in small raised type, numbered by position in the source list.
private func sciCite(_ ids: [String]) -> Text {
  let numbers = ids.map { id in (sciRefs.firstIndex { $0.id == id } ?? -1) + 1 }
  return Text("[" + numbers.map(String.init).joined(separator: ", ") + "]")
    .font(HearthFont.body(11))
    .foregroundStyle(Theme.muted)
    .baselineOffset(6)
}

// Building blocks -----------------------------------------------------------------------

/// A plain paragraph.
private struct SciPara: View {
  let text: String
  init(_ text: String) { self.text = text }
  var body: some View {
    Text(text)
      .font(HearthFont.body(16)).foregroundStyle(Theme.ink)
      .fixedSize(horizontal: false, vertical: true)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A paragraph made of several runs (text with citations).
private struct SciRich: View {
  let text: Text
  init(_ text: Text) { self.text = text }
  var body: some View {
    text
      .font(HearthFont.body(16)).foregroundStyle(Theme.ink)
      .fixedSize(horizontal: false, vertical: true)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A sub-heading inside "How a day becomes one number".
private struct SciH3: View {
  let text: String
  init(_ text: String) { self.text = text }
  var body: some View {
    Text(text)
      .font(HearthFont.body(17, weight: "SemiBold")).foregroundStyle(Theme.ink)
      .fixedSize(horizontal: false, vertical: true)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.top, 8)
      .accessibilityAddTraits(.isHeader)
  }
}

/// A bulleted or numbered row; the text is built by the caller so it can mix weights and citations.
private struct SciListRow: View {
  let marker: String
  let text: Text
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text(marker)
        .font(HearthFont.body(16)).foregroundStyle(Theme.muted)
        .frame(minWidth: 20, alignment: .trailing)
        .accessibilityHidden(true)
      text
        .font(HearthFont.body(16)).foregroundStyle(Theme.ink)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

/// One signal: a bold title, the finding with its citations, then what Hearth does with it.
private struct SciSignal: View {
  let title: String
  let found: String
  let cites: [String]
  let inHearth: String
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title)
        .font(HearthFont.body(17, weight: "SemiBold")).foregroundStyle(Theme.ink)
        .accessibilityAddTraits(.isHeader)
      SciRich(Text(found) + sciCite(cites))
      Text("In Hearth")
        .font(HearthFont.body(13, weight: "SemiBold")).foregroundStyle(Theme.muted)
        .padding(.top, 2)
      SciPara(inHearth)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct SciDivider: View {
  var body: some View { Rectangle().fill(Theme.line).frame(height: 1) }
}

/// A formula as it is in the engine: monospaced, one line per row, scrolling sideways when a
/// row is wider than the screen.
private struct SciFormula: View {
  let lines: [String]
  init(_ lines: [String]) { self.lines = lines }
  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      Text(lines.joined(separator: "\n"))
        .font(.system(size: 13, design: .monospaced))
        .foregroundStyle(Theme.ink)
        .fixedSize(horizontal: true, vertical: true)
        .textSelection(.enabled)
    }
    .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
  }
}
