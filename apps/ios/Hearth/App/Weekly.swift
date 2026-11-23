import Foundation

// The weekly reflection (task D) and the note in the user's own voice (task P), as on the web
// (apps/web/src/screens/Weekly.tsx and WeekNote.tsx).
//
// D is class S1: weekly numbers only. It goes to the cloud only with consent and only with the
// exact payload the user has seen and approved (the router checks this); otherwise it is the
// short version on this device, or without consent the plain summary written by code.
// P is class S3: the week's own texts stay on this device; the on-device model suggests a
// general note, code checks it for names, numbers and places, and the user edits or removes it
// before it becomes part of the weekly summary.

struct WeeklyReflection: Equatable {
  var reflection: String
  var question: String
  var ranOn: String        // cloud | on_device | template
  var variant: String?     // full | lite | nil (template)
}

enum Weekly {
  /// Weeks given to task D (docs/05 task D).
  static let weeksUsed = 12

  /// "the week of 28 Sept" (web: `weekLabel`).
  static func weekLabel(_ isoWeek: String) -> String {
    guard let monday = (try? JSONText.decode([String].self, Engine.shared.call("datesOfIsoWeek", isoWeek)))?.first else { return isoWeek }
    return "the week of \(SummaryPageContent.weekOf(monday))"
  }

  private static let domainWord: [String: String] = ["activity": "activity", "rhythm": "daily rhythm", "sleep": "rest", "body": "heart", "mobility": "places", "phone": "phone use"]

  /// A weekly aggregate in the words the person sees in the app (web: `readableWeek`). Same
  /// numbers, same data (S1, nothing added): only field names, ids and week codes become words.
  static func readable(_ w: WeekAggregateValue) -> [String: Any] {
    let label = { (f: String) in Copy.feature(f) == "Visits to a place" ? "Visits to a named place" : Copy.feature(f) }
    var areas: [String: Any] = [:]
    for (k, v) in w.domainMeans { areas[domainWord[k] ?? k] = v }
    var seen = Set<String>()
    let moved = w.topContributors.map(label).filter { seen.insert($0).inserted }
    let none: Any = NSNull()
    return [
      "week": weekLabel(w.isoWeek),
      "days with data": w.daysWithData,
      "change from usual": w.indexMean.map { $0 as Any } ?? none,
      "days that looked different from usual": w.daysElevated,
      "change from usual by area": areas,
      "signals that moved most": moved,
      "check-ins": w.ema.n == 0 ? none : [
        "answered": w.ema.n,
        "feeling down (out of 7)": w.ema.mood_low.map { $0 as Any } ?? none,
        "enjoyment (out of 7)": w.ema.enjoyment.map { $0 as Any } ?? none,
        "energy (out of 7)": w.ema.energy.map { $0 as Any } ?? none,
      ] as [String: Any],
      "PHQ-2 score": w.phq2.map { $0 as Any } ?? none,
      "PHQ-9 score": w.phq9.map { $0 as Any } ?? none,
      "what was going on": w.contexts.map { Copy.context[$0] ?? $0 },
      "note in the person's own words": w.note?.text ?? none,
    ]
  }

  /// Task D's input for a variant: lite compares this week with the one before (on the
  /// device), full uses up to 12 weeks. The number of weeks is a fact from code (R2).
  static func input(_ weeks: [WeekAggregateValue], variant: String) -> [String: Any] {
    let ws = variant == "lite" ? Array(weeks.suffix(2)) : Array(weeks.suffix(weeksUsed))
    return ["variant": variant, "number of weeks": ws.count, "weeks": ws.map(readable)]
  }
}

extension AppModel {
  /// Finished weeks, oldest first.
  var weekAggregates: [WeekAggregateValue] {
    store.all(WeekAggregate.self, sort: [SortDescriptor(\.isoWeek)]).compactMap(\.value)
  }

  private func reflectionOptions(approved: String?, allowCloud: Bool) -> InferenceRouter.Options {
    let weeks = weekAggregates
    return .init(variantInput: { Weekly.input(weeks, variant: $0) }, approvedCloudPayload: approved, allowCloud: allowCloud)
  }

  /// The exact text the weekly reflection would send to the cloud, or nil when it would not
  /// reach the cloud (no consent, cloud not set up, no weeks).
  func weeklyCloudPayload() -> String? {
    let weeks = weekAggregates
    guard !weeks.isEmpty else { return nil }
    return router.cloudPayload("D", input: Weekly.input(weeks, variant: "full"), options: reflectionOptions(approved: nil, allowCloud: true))
  }

  /// Task D through the router. `approved` is the payload the user saw and agreed to send;
  /// without it the cloud is never used. Falls back to the plain summary written by code.
  func writeReflection(approved: String?, allowCloud: Bool = true) async -> WeeklyReflection {
    let weeks = weekAggregates
    guard !weeks.isEmpty else {
      let t = Copy.weeklyTemplate(weeks)
      return WeeklyReflection(reflection: t.reflection, question: t.question, ranOn: "template", variant: nil)
    }
    let res = await router.run("D", input: Weekly.input(weeks, variant: "full"), options: reflectionOptions(approved: approved, allowCloud: allowCloud))
    if res.ok, let o = JSONText.object(res.json ?? "") as? [String: Any], let r = o["reflection"] as? String, let q = o["open_question"] as? String {
      return WeeklyReflection(reflection: r, question: q, ranOn: res.ranOn, variant: res.ranOn == "on_device" ? "lite" : "full")
    }
    let t = Copy.weeklyTemplate(weeks)
    return WeeklyReflection(reflection: t.reflection, question: t.question, ranOn: "template", variant: nil)
  }

  // The note in your own voice (task P) ------------------------------------------------------

  enum WeekNoteSuggestion: Equatable {
    case draft(themes: [String], text: String, ranOn: String)
    case noText
    case noModel
  }

  /// What the note may not contain besides digits and capitalised names: the labels of the
  /// user's places and the names of their people (web: `checkOpts`).
  var weekNoteBlocked: [String] {
    let places = engineState?.places.compactMap(\.label) ?? []
    let people = store.all(Person.self).map(\.name).filter { !$0.isEmpty }
    return places + people
  }

  /// The week's own texts → a general note, written on this device only (S3).
  func suggestWeekNote(_ isoWeek: String) async -> WeekNoteSuggestion {
    guard let dates = try? JSONText.decode([String].self, Engine.shared.call("datesOfIsoWeek", isoWeek)), let first = dates.first, let last = dates.last else { return .noText }
    let texts = store.all(DiaryEntry.self, sort: [SortDescriptor(\.date)])
      .filter { $0.date >= first && $0.date <= last }
      .compactMap { $0.text?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    guard !texts.isEmpty else { return .noText }
    let text = texts.joined(separator: "\n---\n")
    let res = await router.run("P", input: ["text": text], options: .init(sourceText: text, verify: ["placeLabels": weekNoteBlocked, "contactName": NSNull()]))
    guard res.ok, let o = JSONText.object(res.json ?? "") as? [String: Any], let note = o["note"] as? String else { return .noModel }
    return .draft(themes: o["themes"] as? [String] ?? [], text: note, ranOn: res.ranOn)
  }

  /// The engine's check on the text the user is about to add (they may have edited it).
  func weekNoteIsSafe(_ text: String) -> Bool {
    let out = (try? Engine.shared.call("piiCheck", text, ["placeLabels": weekNoteBlocked, "contactName": NSNull()])).flatMap { JSONText.object($0) as? [String: Any] }
    return out?["ok"] as? Bool == true
  }

  /// Adds the approved note to the week's summary, or removes it (nil). Returns false when the
  /// text does not pass the check, in which case nothing is stored.
  @discardableResult
  func setWeekNote(_ isoWeek: String, themes: [String] = [], text: String?) -> Bool {
    guard let row = store.first(WeekAggregate.self, where: #Predicate { $0.isoWeek == isoWeek }),
          var obj = JSONText.object(row.json) as? [String: Any] else { return false }
    if let t = text?.trimmingCharacters(in: .whitespacesAndNewlines) {
      guard !t.isEmpty, t.count <= 200, weekNoteIsSafe(t) else { return false }
      obj["note"] = ["themes": themes, "text": t]
    } else {
      obj["note"] = NSNull()
    }
    row.json = JSONText.encode(obj)
    row.uploaded = false
    changed()
    return true
  }
}
