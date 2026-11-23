import Foundation

/// Pure helpers for the pages for the GP or clinician (web: apps/web/src/export/gpSummary.ts).
/// Every number on those pages comes from here or from the engine, never from a model (R2).
/// Wording follows R9: "a change from my usual pattern", never a diagnosis.
enum GPSummary {
  struct Change: Equatable {
    var state: EngineStateName?
    /// First day of the current changed period (ELEVATED or CONFIRMED), or nil when there is none.
    var since: String?
    /// Days in the current changed period, counting the first and the last scored day.
    var days: Int
    /// What changed most on the last scored day, as plain phrases built by the engine.
    var changes: [String]
    var lastDate: String?
  }

  private static let changed: Set<EngineStateName> = [.ELEVATED, .CONFIRMED]

  static func change(_ records: [(date: String, state: EngineStateName, phrases: [String])]) -> Change {
    let sorted = records.sorted { $0.date < $1.date }
    guard let last = sorted.last else { return Change(state: nil, since: nil, days: 0, changes: [], lastDate: nil) }
    if !changed.contains(last.state) { return Change(state: last.state, since: nil, days: 0, changes: [], lastDate: last.date) }
    var i = sorted.count - 1
    while i > 0 && changed.contains(sorted[i - 1].state) { i -= 1 }
    return Change(state: last.state, since: sorted[i].date, days: sorted.count - i, changes: last.phrases, lastDate: last.date)
  }

  static func change(_ records: [DayRecordValue]) -> Change {
    change(records.map { ($0.date, $0.state, $0.contributors.map(\.phrase)) })
  }

  /// The questionnaire's scale and what the score means against its usual reference values.
  static func note(_ q: QuestionnaireRecordValue, phq2Cutoff: Int) -> String {
    let r = q.result
    if q.instrument == "PHQ2" {
      return r.total >= phq2Cutoff ? "At or above the usual cut-off of \(phq2Cutoff); PHQ-9 offered" : "Below the usual cut-off of \(phq2Cutoff)"
    }
    var parts: [String] = []
    if let band = r.band, !band.isEmpty { parts.append("Range: \(band.replacingOccurrences(of: "_", with: " "))") }
    if let c = r.changeFromReference, c != 0 { parts.append("\(c > 0 ? "+" : "")\(c) from my reference score") }
    if r.flagged { parts.append("a clear change from my usual score") }
    if r.safetyItemPositive { parts.append("item 9 answered above 0; support resources shown") }
    return parts.joined(separator: "; ")
  }

  static func maxScore(_ instrument: String) -> Int { instrument == "PHQ9" ? 27 : 6 }
  static func name(_ instrument: String) -> String { instrument == "PHQ9" ? "PHQ-9" : "PHQ-2" }

  /// Labels on the GP page are in the first person ("Middle of my night"), like the rest of the page.
  static func firstPerson(_ label: String) -> String {
    label.replacingOccurrences(of: #"\byour\b"#, with: "my", options: .regularExpression)
      .replacingOccurrences(of: #"\bYour\b"#, with: "My", options: .regularExpression)
  }

  /// "5 Oct 2026": a clinical document carries the year (en-GB, as on the web).
  static func docDate(_ day: String) -> String {
    guard let d = Clock.date(String(day.prefix(10))) else { return day }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_GB")
    f.timeZone = .current
    f.setLocalizedDateFormatFromTemplate("dMMMy")
    return f.string(from: d)
  }

  /// The PHQ-2 cut-off from the config (R2: not a constant in the UI).
  static var phq2Cutoff: Int { (JSONText.object(Shared.configJSON) as? [String: Any])?["phq2Cutoff"] as? Int ?? 3 }
}

/// What the one-page plan for the GP shows, in the web's order (web: screens/PlanPrint.tsx):
/// header, 1. Current status, 2. Plan by phase (Stable, Early signs, Crisis), 3. Questionnaires,
/// footer. Built in code from the store; no model writes any of it.
struct PlanPageContent: Equatable {
  struct Bullet: Equatable { var text: String; var how: String? }
  struct QRow: Equatable { var date, name, score, note: String }

  var date: String
  var status: [String]
  var stableSigns = "My usual days. Hearth compares my sleep, activity, daily rhythm, heart rate and places with them."
  var stableDo = "Short check-ins in Hearth, about one day in three."
  var stableOthers = "–"
  /// Early signs: the user's signs and check-in questions; the page says "No personal signs
  /// written yet." when there are none, as on the web.
  var earlySigns: [Bullet]
  var earlyDo: [Bullet]
  var earlyDoNote = "If the change lasts, Hearth offers the PHQ-2, then the PHQ-9."
  var earlyOthers: [String]
  var crisisSigns: String
  var crisisDo: [String]
  var crisisOthers: [String]
  var questionnaires: [QRow]
  var footer: String

  static let title = "Relapse prevention plan"
  static let subtitle = "Signaleringsplan · summary kept and shared by the patient"

  struct Inputs {
    var today: String
    var records: [DayRecordValue]
    var rules: [PlanRuleValue]
    var items: [PersonalItemValue]
    var actions: [PlanActionValue]
    var questionnaires: [QuestionnaireRecordValue]
    var people: [(name: String, goodFor: String)]
    var safety: (warningSigns: String, helps: String, whoToCall: String)?
    var places: [Place]
    var line: CrisisLines.Line
    var phq2Cutoff: Int
    var simulated: Bool
  }

  static func build(_ d: Inputs) -> PlanPageContent {
    let c = GPSummary.change(d.records)
    let qs = d.questionnaires.sorted { $0.takenAt < $1.takenAt }
    let recent = Array(qs.suffix(4))

    var first: String
    if let since = c.since {
      first = "Since \(GPSummary.docDate(since)) (\(c.days) \(c.days == 1 ? "day" : "days")), Hearth has noticed a change from my usual pattern."
      if !c.changes.isEmpty, let last = c.lastDate { first += " Main changes on \(GPSummary.docDate(last)): \(c.changes.joined(separator: "; "))." }
    } else {
      first = c.state == .MONITOR ? "My days are within my usual pattern." : "Hearth is still learning my usual pattern."
    }
    var status = [first]
    if let l = qs.last {
      status.append("Latest questionnaire: \(GPSummary.name(l.instrument)) on \(GPSummary.docDate(l.takenAt)), score \(l.result.total) of \(GPSummary.maxScore(l.instrument)). \(GPSummary.note(l, phq2Cutoff: d.phq2Cutoff)).")
    }

    let rules = d.rules.filter(\.active), items = d.items.filter(\.active), actions = d.actions.filter(\.active)
    let signs = rules.map { r in
      Bullet(text: "“\(r.quote)”", how: "Measured: \(GPSummary.firstPerson(Copy.feature(Copy.ruleFeature(r), places: d.places)).lowercased()) \(Copy.direction(r.feature, r.direction))")
    } + items.map { Bullet(text: "“\($0.quote)”", how: "Asked at check-ins: \($0.question)") }
    let todo = actions.map { Bullet(text: $0.text, how: $0.smaller.map { "If that is too much: \($0)" }) }
    let others = d.people.map { p in (p.name.isEmpty ? "Someone I trust" : p.name) + (p.goodFor.isEmpty ? "" : ": \(p.goodFor)") }

    let s = d.safety
    let warning = s?.warningSigns.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let helps = s?.helps.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let who = s?.whoToCall.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let call = "Call \(d.line.name)\(d.line.phone.map { " (\($0))" } ?? "")."
    let gp = "GP or out-of-hours GP service.\(d.line.emergency.map { " Emergency: \($0)." } ?? "")"

    return PlanPageContent(
      date: GPSummary.docDate(d.today),
      status: status,
      earlySigns: signs,
      earlyDo: todo,
      earlyOthers: others,
      crisisSigns: warning.isEmpty ? "Not written down yet." : warning,
      crisisDo: (helps.isEmpty ? [] : [helps]) + [call],
      crisisOthers: (who.isEmpty ? [] : [who]) + [gp],
      questionnaires: recent.map { q in
        QRow(date: GPSummary.docDate(q.takenAt), name: GPSummary.name(q.instrument), score: "\(q.result.total) / \(GPSummary.maxScore(q.instrument))", note: GPSummary.note(q, phq2Cutoff: d.phq2Cutoff))
      },
      footer: "Made and shared by the patient with Hearth, a self-insight app. Hearth is not a medical device and does not diagnose. Text in quotation marks is in the patient's own words. Sensor data: \(d.simulated ? "simulated (demo person)" : "own phone and watch"). PHQ-2 and PHQ-9 answered by the patient. A structured copy (FHIR R4) can be downloaded from the app.")
  }

  /// From the store, as the web reads it (Dexie lists by key, so by id).
  @MainActor
  static func load(_ app: AppModel) -> PlanPageContent {
    let store = app.store
    let country = app.settings.country
    let safety = store.all(SafetyPlan.self).first
    #if DEBUG
    let simulated = DemoData.enabled
    #else
    let simulated = false
    #endif
    return build(Inputs(
      today: Clock.today,
      records: store.records().compactMap(\.value),
      rules: store.all(PlanRule.self, sort: [SortDescriptor(\.id)]).compactMap(\.value),
      items: store.all(PersonalItem.self, sort: [SortDescriptor(\.id)]).compactMap(\.value),
      actions: store.activeActions(),
      questionnaires: store.all(QuestionnaireRecord.self).compactMap(\.value),
      people: People.all(store).map { ($0.name, $0.goodFor) },
      safety: safety.map { ($0.warningSigns, $0.helps, $0.whoToCall) },
      places: app.engineState?.places ?? [],
      line: Shared.crisisLines.countries[country] ?? Shared.crisisLines.default,
      phq2Cutoff: GPSummary.phq2Cutoff,
      simulated: simulated))
  }
}

/// The summary for a clinician: the last 12 weekly summaries, as the web's shared summary
/// shows them (web: screens/Report.tsx, "Weekly data"). Weekly numbers only (S1): no notes,
/// places or names. Built in code; the cloud overview (task E) and the share link are not part
/// of this build.
struct SummaryPageContent: Equatable {
  struct Row: Equatable {
    var week, days, index, changedDays, signals, down, phq2, phq9, context: String
  }
  static let title = "Shared summary"
  static let intro = "Shared by the person themselves: weekly summaries of daily patterns and questionnaire scores. They describe changes from that person’s usual pattern, not a condition."
  static let columns = ["Week of", "Days", "Index", "Changed days", "Top signals", "Down (1–7)", "PHQ-2", "PHQ-9", "Context"]
  static let weeksShown = 12

  var date: String
  var rows: [Row]
  var footer = "Made by the person with Hearth, a self-insight app, on their own phone. Hearth is not a medical device and does not diagnose."

  /// `monday` gives the first day of an ISO week (the engine's `datesOfIsoWeek`).
  static func build(weeks: [WeekAggregateValue], today: String, monday: (String) -> String?) -> SummaryPageContent {
    let shown = weeks.sorted { $0.isoWeek < $1.isoWeek }.suffix(weeksShown)
    let num = { (v: Double?) in v.map(JSONText.number) ?? "–" }
    let int = { (v: Int?) in v.map(String.init) ?? "–" }
    return SummaryPageContent(date: GPSummary.docDate(today), rows: shown.map { w in
      let signals = w.topContributors.map { Copy.feature($0) }.joined(separator: ", ")
      let ctx = w.contexts.map { Copy.context[$0] ?? $0 }.joined(separator: ", ")
      return Row(
        week: monday(w.isoWeek).map(weekOf) ?? w.isoWeek,
        days: "\(w.daysWithData)",
        index: num(w.indexMean),
        changedDays: "\(w.daysElevated)",
        signals: signals.isEmpty ? "–" : signals,
        down: num(w.ema.mood_low),
        phq2: int(w.phq2),
        phq9: int(w.phq9) + (w.phq9Flagged == true ? " ⚑" : ""),
        context: ctx.isEmpty ? "–" : ctx)
    })
  }

  /// "28 Sep", as `weekLabel` on the web without "the week of".
  static func weekOf(_ monday: String) -> String {
    guard let d = Clock.date(monday) else { return monday }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_GB")
    f.timeZone = .current
    f.setLocalizedDateFormatFromTemplate("dMMM")
    return f.string(from: d)
  }

  /// The same summary as plain text, to paste into a message or a portal.
  var text: String {
    var out = ["\(Self.title) from Hearth, \(date)", "", Self.intro, ""]
    if rows.isEmpty { out.append("No full week of data yet.") }
    for r in rows {
      out.append("Week of \(r.week): \(r.days) days with data. Index \(r.index). Changed days \(r.changedDays). Top signals: \(r.signals). Down (1–7): \(r.down). PHQ-2: \(r.phq2). PHQ-9: \(r.phq9). Context: \(r.context).")
    }
    out += ["", footer]
    return out.joined(separator: "\n")
  }

  @MainActor
  static func load(_ store: Store) -> SummaryPageContent {
    let weeks = store.all(WeekAggregate.self, sort: [SortDescriptor(\.isoWeek)]).compactMap(\.value)
    return build(weeks: weeks, today: Clock.today) { w in
      (try? JSONText.decode([String].self, Engine.shared.call("datesOfIsoWeek", w)))?.first
    }
  }
}
