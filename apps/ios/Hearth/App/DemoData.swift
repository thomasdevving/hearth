import Foundation

/// Debug only: launch with `-HearthDemo YES` to fill day_raw with generated data instead of
/// HealthKit, so the screens can be checked in the Simulator (which has no Health history).
/// Add `-HearthDemoChange YES` for a drift over the last two weeks (later nights, fewer steps),
/// so the Changed state and Why? can be checked too.
enum DemoData {
  #if DEBUG
  static var enabled: Bool { UserDefaults.standard.bool(forKey: "HearthDemo") }
  static var change: Bool { enabled && UserDefaults.standard.bool(forKey: "HearthDemoChange") }
  /// Days at the end that drift away from the usual pattern when `change` is on.
  static let driftDays = 14

  @MainActor
  static func fill(store: Store, days: Int, change: Bool = DemoData.change) {
    let today = Clock.today
    var rng = SystemRandomNumberGenerator()
    for k in stride(from: days, through: 1, by: -1) {
      let date = Clock.addDays(today, -k)
      if store.raw(date) != nil { continue }
      // 0 on usual days, rising to 1 on yesterday.
      let t = change && k <= driftDays ? Double(driftDays + 1 - k) / Double(driftDays) : 0
      var bins = [Double](repeating: 0, count: 96)
      let wake = 28 + Int(t * 8) + Int.random(in: -2...2, using: &rng)   // ~07:00, later in the drift
      let sleep = 92 + Int.random(in: -3...2, using: &rng)  // ~23:00
      for i in wake..<min(sleep, 96) { bins[i] = (Double(Int.random(in: 0...180, using: &rng)) * (1 - 0.6 * t)).rounded() }
      let prevSleep = Clock.calendar.date(byAdding: .minute, value: -60 + Int(t * 150) + Int.random(in: -30...30, using: &rng), to: Clock.startOfDay(date))!
      let wakeTime = Clock.calendar.date(byAdding: .minute, value: wake * 15, to: Clock.startOfDay(date))!
      let obj: [String: Any] = [
        "date": date, "stepBins15": bins, "walkingSpeed": 1.25 - 0.15 * t + Double.random(in: -0.08...0.08, using: &rng),
        "sleep": [["start": Clock.stamp(prevSleep), "end": Clock.stamp(wakeTime)]],
        "visits": NSNull(), "phone": NSNull(),
        "heart": ["hrv": 45 - 8 * t + Double.random(in: -8...8, using: &rng), "restingHr": 58 + 4 * t + Double.random(in: -2...2, using: &rng)],
      ]
      store.context.insert(DayRaw(date: date, json: JSONText.encode(obj), complete: true))
    }
    store.save()
  }

  /// A sign in the plan for the drifting signal, so Why? can show the user's own words.
  @MainActor
  static func addRule(store: Store) {
    guard store.all(PlanRule.self).isEmpty else { return }
    let obj: [String: Any] = ["id": "rule_demo", "feature": "rest_midpoint", "direction": "later", "placeId": NSNull(), "quote": "I go to bed later and later", "active": true]
    store.context.insert(PlanRule(id: "rule_demo", json: JSONText.encode(obj)))
    store.save()
  }

  /// `-HearthDemoActions YES`: three actions, two with a smaller step, and earlier choices, so
  /// the plan's smaller steps can be checked.
  @MainActor
  static func addActions(store: Store) {
    guard store.all(PlanAction.self).isEmpty else { return }
    let today = Clock.today
    let actions: [[String: Any]] = [
      ["id": "action_walk", "text": "Go for a walk before lunch", "quote": "a walk at lunch clears my head", "active": true, "smaller": "Step outside for five minutes"],
      ["id": "action_call", "text": "Call my sister", "quote": "talking to my sister helps", "active": true],
      ["id": "action_cook", "text": "Cook a proper meal", "quote": "cooking a real meal grounds me", "active": true, "smaller": "Make toast and eat it at the table"],
    ]
    for a in actions { store.context.insert(PlanAction(id: a["id"] as! String, json: JSONText.encode(a))) }
    store.chooseVersion(actionId: "action_walk", date: Clock.addDays(today, -3), choice: .full)
    store.chooseVersion(actionId: "action_walk", date: Clock.addDays(today, -1), choice: .smaller)
    store.chooseVersion(actionId: "action_cook", date: today, choice: .smaller)
    store.save()
  }

  /// `-HearthDemoPick YES`: a stand-in for the on-device model for task K only (the Simulator
  /// has none). It picks the first action; the output still goes through the router's
  /// verification and ledger.
  static var pick: Bool { enabled && UserDefaults.standard.bool(forKey: "HearthDemoPick") }

  static func stubK(_ input: [String: Any]) -> String {
    let first = (input["actions"] as? [[String: Any]])?.first?["id"] as? String
    return JSONText.encode(["action_ids": first.map { [$0] } ?? []])
  }

  /// `-HearthDemoRecall YES`: a stand-in for the on-device model for tasks R and T only. R
  /// picks the first sign and quotes the text's first clause; T writes "Hi <name>, <saved
  /// message>". Both still go through the router's verification and ledger, on this device.
  static var recall: Bool { enabled && UserDefaults.standard.bool(forKey: "HearthDemoRecall") }

  /// Whether a stand-in answers this task.
  static func stubs(_ task: String) -> Bool { (pick && task == "K") || (recall && (task == "R" || task == "T")) }

  static func stub(_ task: String, _ input: [String: Any]) -> String {
    switch task {
    case "R": return stubR(input)
    case "T": return stubT(input)
    default: return stubK(input)
    }
  }

  static func stubR(_ input: [String: Any]) -> String {
    let text = input["text"] as? String ?? ""
    let clause = text.split(whereSeparator: { ".,;!?\n".contains($0) }).first.map { String($0).trimmingCharacters(in: .whitespaces) } ?? ""
    let first = (input["signs"] as? [[String: Any]])?.first?["id"] as? String
    guard let first, !clause.isEmpty else { return JSONText.encode(["matches": [Any]()]) }
    return JSONText.encode(["matches": [["sign_id": first, "quote": String(clause.prefix(120))]]])
  }

  static func stubT(_ input: [String: Any]) -> String {
    let name = input["name"] as? String ?? ""
    let saved = (input["saved_message"] as? String ?? "").trimmingCharacters(in: .whitespaces)
    let body = saved.isEmpty ? "Fancy a walk soon?" : saved.prefix(1).lowercased() + saved.dropFirst()
    return JSONText.encode(["message": name.isEmpty ? String(body.prefix(1).uppercased() + body.dropFirst()) : "Hi \(name), \(body)"])
  }

  /// `-HearthDemoHelped YES`: one of Sam's check-in questions ("stop replying to messages")
  /// and the note Sam saved for it (web: SAM_HELPED_NOTE), so the plan's "What helped you
  /// before" and the recall after a check-in can be checked.
  static var helped: Bool { enabled && UserDefaults.standard.bool(forKey: "HearthDemoHelped") }

  @MainActor
  static func addHelped(store: Store) {
    if !store.all(PersonalItem.self).contains(where: { $0.value?.quote == "stop replying to messages" }) {
      let obj: [String: Any] = ["id": "item_demo_reply", "question": "Did you reply to messages today?", "quote": "stop replying to messages", "active": true]
      store.context.insert(PersonalItem(id: "item_demo_reply", json: JSONText.encode(obj)))
    }
    if store.all(HelpedNote.self).isEmpty {
      store.context.insert(HelpedNote(id: "seed-sam-1", signQuote: "stop replying to messages", text: "Calling felt like too much. I texted Maya “walk tomorrow?” and that was easier.", audio: nil, message: "Walk tomorrow?", contactName: "Maya", createdAt: "2026-02-26", source: "seed"))
    }
    store.save()
  }
  #else
  static let enabled = false
  #endif
}
