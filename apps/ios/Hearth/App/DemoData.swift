import Foundation

/// Debug only: launch with `-HearthDemo YES` to fill day_raw with generated data instead of
/// HealthKit, so the screens can be checked in the Simulator (which has no Health history).
enum DemoData {
  #if DEBUG
  static var enabled: Bool { UserDefaults.standard.bool(forKey: "HearthDemo") }

  @MainActor
  static func fill(store: Store, days: Int) {
    let today = Clock.today
    var rng = SystemRandomNumberGenerator()
    for k in stride(from: days, through: 1, by: -1) {
      let date = Clock.addDays(today, -k)
      if store.raw(date) != nil { continue }
      var bins = [Double](repeating: 0, count: 96)
      let wake = 28 + Int.random(in: -2...2, using: &rng)   // ~07:00
      let sleep = 92 + Int.random(in: -3...2, using: &rng)  // ~23:00
      for i in wake..<min(sleep, 96) { bins[i] = Double(Int.random(in: 0...180, using: &rng)) }
      let prevSleep = Clock.calendar.date(byAdding: .minute, value: -60 + Int.random(in: -30...30, using: &rng), to: Clock.startOfDay(date))!
      let wakeTime = Clock.calendar.date(byAdding: .minute, value: wake * 15, to: Clock.startOfDay(date))!
      let obj: [String: Any] = [
        "date": date, "stepBins15": bins, "walkingSpeed": 1.25 + Double.random(in: -0.08...0.08, using: &rng),
        "sleep": [["start": Clock.stamp(prevSleep), "end": Clock.stamp(wakeTime)]],
        "visits": NSNull(), "phone": NSNull(),
        "heart": ["hrv": 45 + Double.random(in: -8...8, using: &rng), "restingHr": 58 + Double.random(in: -2...2, using: &rng)],
      ]
      store.context.insert(DayRaw(date: date, json: JSONText.encode(obj), complete: true))
    }
    store.save()
  }
  #else
  static let enabled = false
  #endif
}
