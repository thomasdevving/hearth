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
  #else
  static let enabled = false
  #endif
}
