import Foundation

// "Ask your data" (mirror of apps/web/src/screens/Ask.tsx; docs/05 task Q). The model on this
// device classifies the question (S3: it is the user's own words), the engine computes the facts
// (R2), and the model only phrases those facts: every number in the answer must be one of them
// (R8). Without a model, or when a check fails, the engine's plain answer is used.

struct AskAnswer: Equatable {
  let text: String
  let ranOn: String   // on_device | cloud | template
}

enum Ask {
  struct Classification: Codable, Equatable {
    let intent: String
    let feature: String
    let period: String
  }

  static let intents: Set<String> = ["trend", "compare", "why_asked", "unsupported", "crisis"]
  static let features: Set<String> = [
    "none", "steps", "active_hours", "walking_speed", "rhythm_stability", "rest_duration", "rest_midpoint", "rest_regularity",
    "hrv", "resting_hr", "home_stay", "places_visited", "routine_regularity", "mood_low", "enjoyment", "energy", "index",
  ]
  static let periods: Set<String> = ["none", "today", "this_week", "last_week", "last_4_weeks"]

  static let notRead = "Sorry, I couldn't read that question on this device."
  static let placeholder = "How was my rest last week compared with usual?"

  /// The router's verified classification, checked once more here (R8): only the three enums
  /// survive, so nothing the model wrote can reach the engine as anything else.
  static func classification(_ json: String?) -> Classification? {
    guard let json, let c = try? JSONText.decode(Classification.self, json),
          intents.contains(c.intent), features.contains(c.feature), periods.contains(c.period) else { return nil }
    return c
  }

  /// The facts for a classified question, computed by the engine (`askFacts`), as JSON.
  @MainActor
  static func facts(_ c: Classification, store: Store, today: String = Clock.today) -> String {
    let cls: [String: Any] = ["intent": c.intent, "feature": c.feature, "period": c.period]
    let records = store.records().map { RawJSON($0.json) }
    let checkins = store.all(CheckinRecord.self).map { RawJSON($0.json) }
    return (try? Engine.shared.call("askFacts", cls, records, checkins, today)) ?? #"{"kind":"unsupported"}"#
  }

  /// The engine's plain answer for the facts (`askTemplate`).
  static func template(_ factsJSON: String) -> String {
    (try? JSONText.decode(String.self, Engine.shared.call("askTemplate", RawJSON(factsJSON)))) ?? ""
  }
}

extension AppModel {
  /// Offered only with a model on this device, as on the web (docs/05 §3).
  var askAvailable: Bool {
    #if DEBUG
    if DemoData.ask { return true }
    #endif
    return settings.onDeviceEnabled && OnDeviceModel.isAvailable
  }

  /// Answers a question about the user's own data. Returns nil when the safety flow was opened
  /// instead (crisis words before any model call, or the classifier's `crisis`).
  func ask(_ question: String) async -> AskAnswer? {
    let q = question.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !q.isEmpty else { return nil }
    if (try? Engine.shared.call("detectCrisis", q)) == "true" { openSafety("keyword"); return nil }
    let c = await router.run("Q_classify", input: ["text": q], options: .init(sourceText: q))
    guard c.ok, let cls = Ask.classification(c.json) else { return AskAnswer(text: Ask.notRead, ranOn: "template") }
    if cls.intent == "crisis" { openSafety("model_crisis"); return nil }
    let facts = Ask.facts(cls, store: store)
    let kind = (JSONText.object(facts) as? [String: Any])?["kind"] as? String
    if kind == "unsupported" { return AskAnswer(text: Ask.template(facts), ranOn: "template") }
    // The phrasing call sees only the computed facts, never the question (docs/05 task Q).
    let p = await router.run("Q_phrase", input: ["facts": RawJSON(facts)], options: .init(verify: ["facts": RawJSON(facts)]))
    if p.ok, let a = (JSONText.object(p.json ?? "") as? [String: Any])?["answer"] as? String, !a.trimmingCharacters(in: .whitespaces).isEmpty {
      return AskAnswer(text: a, ranOn: p.ranOn)
    }
    return AskAnswer(text: Ask.template(facts), ranOn: "template")
  }
}
