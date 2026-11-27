import Foundation

// UI copy, the same words as the web app (apps/web/src/app/labels.ts and templates.ts).
// Plain, warm, no diagnostic words (R9).

enum Copy {
  static let stateLabel: [EngineStateName: String] = [
    .WARM_UP: "Learning your pattern", .MONITOR: "Steady", .ELEVATED: "Changed", .CONFIRMED: "Changed",
  ]
  static let stateText: [EngineStateName: String] = [
    .WARM_UP: "Hearth is still learning what your usual weeks look like. This takes about two weeks.",
    .MONITOR: "Your days look like your usual pattern.",
    .ELEVATED: "Some of your signals have moved away from your usual pattern for a few days. That can have many reasons.",
    .CONFIRMED: "Your answers and your signals both show a change from your usual pattern. Your plan is below.",
  ]

  static let featureLabel: [String: String] = [
    "steps": "Steps", "active_hours": "Active hours", "walking_speed": "Walking pace",
    "rhythm_stability": "Daily rhythm", "fragmentation": "Activity in short bursts", "relative_amplitude": "Day–night difference",
    "rest_duration": "Rest length", "rest_midpoint": "Middle of your night", "rest_regularity": "Regular rest times",
    "hrv": "Heart rate variability", "resting_hr": "Resting heart rate",
    "home_stay": "Time at home", "location_entropy": "Variety of places", "places_visited": "Places visited",
    "location_variance": "Area covered", "routine_regularity": "Usual routine", "place_visits": "Visits",
    "screen_time": "Screen time", "night_use": "Phone use at night", "communication_time": "Time in messaging apps",
  ]

  static func feature(_ id: String, places: [Place] = []) -> String {
    if id.hasPrefix("place_visits") {
      let pid = id.split(separator: ":").dropFirst().first.map(String.init)
      if let p = places.first(where: { $0.id == pid }), let l = p.label { return "Visits to the \(l)" }
      return "Visits to a place"
    }
    return featureLabel[id] ?? id
  }

  static func ruleFeature(_ r: PlanRuleValue) -> String {
    r.feature == "place_visits" && r.placeId != nil ? "place_visits:\(r.placeId!)" : r.feature
  }

  static let direction: [String: String] = [
    "higher": "goes up", "lower": "goes down", "later": "gets later", "earlier": "gets earlier", "less_regular": "gets less regular",
  ]
  /// Plural labels ("Steps", "Visits to the gym") take a plural verb, as on the web.
  private static let plural: Set<String> = ["steps", "active_hours", "rest_regularity", "places_visited", "place_visits"]
  private static let pluralDirection: [String: String] = [
    "higher": "go up", "lower": "go down", "later": "get later", "earlier": "get earlier", "less_regular": "get less regular",
  ]
  static func direction(_ feature: String, _ dir: String) -> String {
    let base = String(feature.split(separator: ":").first ?? "")
    return (plural.contains(base) ? pluralDirection : direction)[dir] ?? dir
  }

  static let context: [String: String] = [
    "holiday": "On holiday", "travel": "Travelling", "visitors": "Visitors staying", "ill": "Ill", "moving": "Moving house",
    "exams": "Exams", "new_job": "New job", "loss": "A loss", "other_stress": "Something stressful",
  ]

  /// docs/04 §7.5: the PHQ-2 offered because more check-ins than usual went unanswered.
  static let unansweredLine = "You've answered fewer check-ins than usual lately. That can just be a busy time. These two are about the last two weeks."

  /// "1.6×", one decimal (docs/04 §4.4).
  static func weightText(_ w: Double) -> String { String(format: "%.1f×", (w * 10).rounded() / 10) }

  /// One sentence for "Why?" when a signal's domain weighs more or less than 1 for this person.
  static func weightSentence(domain: String, personal: PersonalWeightsValue?) -> String? {
    guard let p = personal, p.isActive else { return nil }
    let w = p.weight(domain)
    guard abs(w - 1) >= 0.05 else { return nil }
    let name = (Copy.domain[domain] ?? domain).lowercased()
    return w > 1
      ? "For you, \(name) counts \(weightText(w)) in the total: on your random check-ins, your low days went with changes in \(name)."
      : "For you, \(name) counts \(weightText(w)) in the total: on your random check-ins, it went with your low days less than your other signals."
  }

  static let domain: [String: String] = [
    "activity": "Activity", "rhythm": "Daily rhythm", "sleep": "Rest", "body": "Heart", "mobility": "Places", "phone": "Phone",
  ]

  static func value(_ feature: String, _ v: Double?) -> String {
    guard let v else { return "–" }
    let f = String(feature.split(separator: ":").first ?? "")
    switch f {
    case "rest_midpoint":
      let m = ((Int(v.rounded()) % 1440) + 1440) % 1440
      return String(format: "%02d:%02d", m / 60, m % 60)
    case "home_stay": return "\(Int((v * 100).rounded())) %"
    case "steps":
      let n = NumberFormatter(); n.numberStyle = .decimal; n.locale = Locale(identifier: "en_GB")
      return n.string(from: NSNumber(value: Int(v.rounded()))) ?? "\(Int(v))"
    case "rest_duration": return String(format: "%.1f h", v)
    case "walking_speed": return String(format: "%.2f m/s", v)
    case "hrv": return "\(Int(v.rounded())) ms"
    case "resting_hr": return "\(Int(v.rounded())) bpm"
    default: return v == v.rounded() ? "\(Int(v))" : String(format: "%.2f", v)
    }
  }

  // Templates (non-LLM fallbacks, docs/05 §3) ----------------------------------------------

  static let introRandom = "Quick check-in. How are you doing right now?"
  static let introTriggered = "A few things look different from your usual week. How are you doing today?"
  static let introFixed = "Time for your regular check-in. How are you doing right now?"

  private static let bandText: [String: String] = [
    "minimal": "Your answers are in the lowest range.",
    "mild": "Your answers are in the mild range.",
    "moderate": "Your answers are in the moderate range.",
    "moderately_severe": "Your answers are in the moderately severe range.",
    "severe": "Your answers are in the highest range.",
  ]

  /// A positive PHQ-2 within a week of a PHQ-9: the longer questionnaire is not repeated yet.
  static let phq9Recent = "You answered the longer questionnaire less than a week ago, so Hearth does not ask it again yet."

  static func resultTemplate(_ r: QuestionnaireResult, phq9Next: Bool = true) -> String {
    if r.id == "PHQ2" {
      if !r.positive { return "Your total is \(r.total) out of 6. Your answers are in the usual range." }
      return phq9Next
        ? "Your total is \(r.total) out of 6. That is a higher score, so the next step is a slightly longer questionnaire."
        : "Your total is \(r.total) out of 6. That is a higher score. \(phq9Recent)"
    }
    var parts = ["Your total is \(r.total) out of 27.", bandText[r.band ?? ""] ?? ""]
    if let c = r.changeFromReference {
      parts.append(c == 0 ? "That is the same as your own usual score." : c > 0 ? "That is \(c) points above your own usual score." : "That is \(-c) points below your own usual score.")
    }
    if r.flagged { parts.append("This is a clear change, so your plan is shown next. It may be a good moment to talk to your GP or clinician.") }
    return parts.filter { !$0.isEmpty }.joined(separator: " ")
  }

  static let nextText: [String: String] = [
    "none": "Nothing else to do now.",
    "offer_phq9": "A slightly longer questionnaire comes next.",
    "show_plan_and_share": "Your plan is shown next. You could share a summary with your GP or clinician.",
    "safety": "Support options are shown.",
  ]

  /// Plain weekly summary written by code (web: templates.ts `weeklyTemplate`). Words, not
  /// the raw index: the comparison is made in code (R2), the number stays on Trends.
  static func weeklyTemplate(_ weeks: [WeekAggregateValue]) -> (reflection: String, question: String) {
    guard let w = weeks.last else { return ("No full week of data yet.", "What would you like to notice this week?") }
    let prev = weeks.count > 1 ? weeks[weeks.count - 2] : nil
    func plural(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }
    var parts = ["In \(Weekly.weekLabel(w.isoWeek)) there were \(plural(w.daysWithData, "day", "days")) with data."]
    if let m = w.indexMean, let p = prev?.indexMean {
      let diff = m - p
      parts.append(abs(diff) < 0.05 ? "Your days were about as close to your usual pattern as the week before." : diff > 0 ? "Your days were a little further from your usual pattern than the week before." : "Your days were closer to your usual pattern than the week before.")
    }
    if w.daysElevated > 0 { parts.append("On \(plural(w.daysElevated, "day", "days")) your pattern looked different from usual.") }
    if w.ema.n > 0, let mood = w.ema.mood_low { parts.append("You answered \(plural(w.ema.n, "check-in", "check-ins")); \"feeling down\" averaged \(JSONText.number(mood)) out of 7.") }
    if !w.contexts.isEmpty { parts.append("You noted: \(w.contexts.joined(separator: ", ")).") }
    return (parts.joined(separator: " "), "What made the better days of this week different?")
  }

  static func fmt(_ v: Double) -> String { v == v.rounded() ? "\(Int(v))" : "\(v)" }

  static let taskName: [String: String] = [
    "G": "Plan → cards", "G2": "Scan a paper plan", "H": "Context from a note", "I": "Spoken check-in",
    "A": "Check-in introduction", "B": "Diary markers", "C": "Explain a result", "K": "Pick your own actions", "R": "Recall what helped", "T": "Draft a text",
    "Q": "Ask your data", "P": "Shareable weekly note", "D": "Weekly reflection", "E": "Clinician report",
  ]

  // Plan setup suggestions (apps/web/src/screens/PlanSetup.tsx) ------------------------------

  struct Sign: Hashable { let id: String; let feature: String; let direction: String; let text: String }
  struct ItemSign: Hashable { let id: String; let text: String; let question: String }

  static let suggestedSigns: [Sign] = [
    .init(id: "sleep_more", feature: "rest_duration", direction: "higher", text: "I sleep or rest much longer than usual"),
    .init(id: "sleep_less", feature: "rest_duration", direction: "lower", text: "I sleep much less than usual"),
    .init(id: "bed_later", feature: "rest_midpoint", direction: "later", text: "I go to bed later and later"),
    .init(id: "sleep_irregular", feature: "rest_regularity", direction: "less_regular", text: "My sleep times get irregular"),
    .init(id: "move_less", feature: "steps", direction: "lower", text: "I move and walk less"),
    .init(id: "home_more", feature: "home_stay", direction: "higher", text: "I stay at home more"),
    .init(id: "fewer_places", feature: "places_visited", direction: "lower", text: "I go to fewer places"),
    .init(id: "days_shapeless", feature: "rhythm_stability", direction: "less_regular", text: "My days lose their structure"),
  ]
  static let suggestedItems: [ItemSign] = [
    .init(id: "withdraw", text: "I pull back from people", question: "Did you have contact with someone you like today?"),
    .init(id: "enjoy", text: "I stop doing things I enjoy", question: "Did you do something you enjoy today?"),
    .init(id: "meals", text: "My eating becomes irregular", question: "Did you eat regular meals today?"),
  ]
  static let placeSigns: [(feature: String, direction: String, text: String, place: String)] = [
    ("place_visits", "lower", "I stop going to the gym", "gym"),
    ("place_visits", "lower", "I stop going to work", "work"),
  ]
  static var suggestionTexts: Set<String> { Set(suggestedSigns.map(\.text) + suggestedItems.map(\.text)) }
}
