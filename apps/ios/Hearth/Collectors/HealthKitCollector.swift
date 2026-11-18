import Foundation
import HealthKit

/// Reads HealthKit into `DayRaw` records (docs/03 §1). It only reads; nothing is written to
/// Health and nothing leaves the device.
///
/// Per local date D:
/// - `stepBins15`: 96 step sums for 00:00–24:00 in 15-minute bins (`null` if no step data);
/// - `walkingSpeed`: mean of the day's walking-speed samples, m/s;
/// - `sleep`: asleep intervals overlapping the night window of D (21:00 on D−1 to 12:00 on D);
/// - `heart.hrv`: mean SDNN (ms) of the samples inside the main sleep period of that night,
///   or between 00:00 and 06:00 on D without sleep data;
/// - `heart.restingHr`: the day's resting heart rate (bpm).
/// `visits` are kept from the stored record (LocationCollector); `phone` is null (P2).
final class HealthKitCollector: @unchecked Sendable {
  static let shared = HealthKitCollector()
  let store = HKHealthStore()

  static var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

  private let stepType = HKQuantityType(.stepCount)
  private let speedType = HKQuantityType(.walkingSpeed)
  private let hrvType = HKQuantityType(.heartRateVariabilitySDNN)
  private let rhrType = HKQuantityType(.restingHeartRate)
  private let sleepType = HKCategoryType(.sleepAnalysis)

  private var readTypes: Set<HKObjectType> { [stepType, speedType, hrvType, rhrType, sleepType] }

  func requestAuthorization() async throws {
    try await store.requestAuthorization(toShare: [], read: readTypes)
  }

  struct Switches: Sendable { var steps = true, walkingSpeed = true, sleep = true, heart = true }

  /// DayRaw fields for every date from `from` to `to` (inclusive), without `visits`.
  func read(from: String, to: String, switches: Switches) async throws -> [String: [String: Any]] {
    let cal = Clock.calendar
    let start = Clock.startOfDay(from)
    let endDay = cal.date(byAdding: .day, value: 1, to: Clock.startOfDay(to))!
    let end = min(endDay, Date.now)
    var days: [String: [String: Any]] = [:]
    var d = from
    while d <= to {
      days[d] = ["date": d, "stepBins15": NSNull(), "walkingSpeed": NSNull(), "sleep": NSNull(), "visits": NSNull(), "phone": NSNull(), "heart": NSNull()]
      d = Clock.addDays(d, 1)
    }

    if switches.steps {
      let bins = try await stepBins(start: start, end: end)
      for (date, b) in bins where days[date] != nil { days[date]?["stepBins15"] = b.map { $0.rounded() } }
    }
    if switches.walkingSpeed {
      let unit = HKUnit.meter().unitDivided(by: .second())
      for (date, v) in try await dailyAverage(speedType, unit: unit, start: start, end: end) where days[date] != nil {
        days[date]?["walkingSpeed"] = v
      }
    }
    var sleepByDate: [String: [(Date, Date)]] = [:]
    if switches.sleep || switches.heart {
      // Night windows start at 21:00 the day before the first date.
      let sleepStart = start.addingTimeInterval(-3 * 3600)
      let intervals = try await asleepIntervals(start: sleepStart, end: end)
      for date in days.keys {
        let (ws, we) = nightWindow(date)
        let inWindow = intervals.filter { $0.1 > ws && $0.0 < we }.sorted { $0.0 < $1.0 }
        if !inWindow.isEmpty { sleepByDate[date] = inWindow }
      }
      if switches.sleep {
        for (date, iv) in sleepByDate {
          days[date]?["sleep"] = iv.map { ["start": Clock.stamp($0.0), "end": Clock.stamp($0.1)] }
        }
      }
    }
    if switches.heart {
      let hrvSamples = try await quantitySamples(hrvType, unit: .secondUnit(with: .milli), start: start.addingTimeInterval(-3 * 3600), end: end)
      let rhr = try await dailyAverage(rhrType, unit: HKUnit.count().unitDivided(by: .minute()), start: start, end: end)
      for date in days.keys {
        let window: (Date, Date)
        if let main = mainSleepPeriod(sleepByDate[date] ?? []) {
          window = main
        } else {
          let s = Clock.startOfDay(date)
          window = (s, s.addingTimeInterval(6 * 3600))
        }
        let vals = hrvSamples.filter { $0.0 >= window.0 && $0.0 <= window.1 }.map(\.1)
        let hrv: Any = vals.isEmpty ? NSNull() : vals.reduce(0, +) / Double(vals.count)
        let r: Any = rhr[date] ?? NSNull()
        if !(hrv is NSNull) || !(r is NSNull) { days[date]?["heart"] = ["hrv": hrv, "restingHr": r] }
      }
    }
    return days
  }

  /// 21:00 on the previous day to 12:00 on `date` (docs/03 §4).
  private func nightWindow(_ date: String) -> (Date, Date) {
    let s = Clock.startOfDay(date)
    return (s.addingTimeInterval(-3 * 3600), s.addingTimeInterval(12 * 3600))
  }

  /// Merge intervals less than 60 minutes apart and return the longest (docs/03 §4).
  private func mainSleepPeriod(_ intervals: [(Date, Date)]) -> (Date, Date)? {
    var merged: [(Date, Date)] = []
    for iv in intervals.sorted(by: { $0.0 < $1.0 }) {
      if let last = merged.last, iv.0.timeIntervalSince(last.1) < 3600 {
        merged[merged.count - 1].1 = max(last.1, iv.1)
      } else {
        merged.append(iv)
      }
    }
    return merged.max { $0.1.timeIntervalSince($0.0) < $1.1.timeIntervalSince($1.0) }
  }

  // Queries ----------------------------------------------------------------------------

  private func stepBins(start: Date, end: Date) async throws -> [String: [Double]] {
    let cal = Clock.calendar
    let collection: HKStatisticsCollection = try await withCheckedThrowingContinuation { cont in
      let q = HKStatisticsCollectionQuery(
        quantityType: stepType,
        quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: end),
        options: .cumulativeSum, anchorDate: start, intervalComponents: DateComponents(minute: 15))
      q.initialResultsHandler = { _, results, error in
        if let results { cont.resume(returning: results) } else { cont.resume(throwing: error ?? HKError(.errorNoData)) }
      }
      store.execute(q)
    }
    var out: [String: [Double]] = [:]
    collection.enumerateStatistics(from: start, to: end) { stats, _ in
      guard let sum = stats.sumQuantity() else { return }
      let date = Clock.day(stats.startDate)
      let c = cal.dateComponents([.hour, .minute], from: stats.startDate)
      let idx = (c.hour ?? 0) * 4 + (c.minute ?? 0) / 15
      guard idx >= 0, idx < 96 else { return }
      if out[date] == nil { out[date] = Array(repeating: 0, count: 96) }
      out[date]![idx] += sum.doubleValue(for: .count())
    }
    return out
  }

  private func dailyAverage(_ type: HKQuantityType, unit: HKUnit, start: Date, end: Date) async throws -> [String: Double] {
    let collection: HKStatisticsCollection = try await withCheckedThrowingContinuation { cont in
      let q = HKStatisticsCollectionQuery(
        quantityType: type,
        quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: end),
        options: .discreteAverage, anchorDate: start, intervalComponents: DateComponents(day: 1))
      q.initialResultsHandler = { _, results, error in
        if let results { cont.resume(returning: results) } else { cont.resume(throwing: error ?? HKError(.errorNoData)) }
      }
      store.execute(q)
    }
    var out: [String: Double] = [:]
    collection.enumerateStatistics(from: start, to: end) { stats, _ in
      if let avg = stats.averageQuantity() { out[Clock.day(stats.startDate)] = avg.doubleValue(for: unit) }
    }
    return out
  }

  private func quantitySamples(_ type: HKQuantityType, unit: HKUnit, start: Date, end: Date) async throws -> [(Date, Double)] {
    let samples: [HKSample] = try await withCheckedThrowingContinuation { cont in
      let q = HKSampleQuery(sampleType: type, predicate: HKQuery.predicateForSamples(withStart: start, end: end),
                            limit: HKObjectQueryNoLimit, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, s, e in
        if let s { cont.resume(returning: s) } else { cont.resume(throwing: e ?? HKError(.errorNoData)) }
      }
      store.execute(q)
    }
    return samples.compactMap { s in (s as? HKQuantitySample).map { ($0.startDate, $0.quantity.doubleValue(for: unit)) } }
  }

  private func asleepIntervals(start: Date, end: Date) async throws -> [(Date, Date)] {
    let samples: [HKSample] = try await withCheckedThrowingContinuation { cont in
      let q = HKSampleQuery(sampleType: sleepType, predicate: HKQuery.predicateForSamples(withStart: start, end: end),
                            limit: HKObjectQueryNoLimit, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, s, e in
        if let s { cont.resume(returning: s) } else { cont.resume(throwing: e ?? HKError(.errorNoData)) }
      }
      store.execute(q)
    }
    let asleep = HKCategoryValueSleepAnalysis.allAsleepValues.map(\.rawValue)
    return samples.compactMap { s in
      guard let c = s as? HKCategorySample, asleep.contains(c.value) else { return nil }
      return (c.startDate, c.endDate)
    }
  }

  // New data -----------------------------------------------------------------------------

  private var observers: [HKObserverQuery] = []

  /// Observer queries with background delivery (docs/02 §7). `onUpdate` is called on any new
  /// sample; it must finish before the completion handler is called.
  func startObserving(onUpdate: @escaping @Sendable () async -> Void) {
    guard observers.isEmpty else { return }
    for type in [stepType, sleepType, hrvType, rhrType, speedType] as [HKSampleType] {
      let q = HKObserverQuery(sampleType: type, predicate: nil) { _, completion, error in
        guard error == nil else { completion(); return }
        Task {
          await onUpdate()
          completion()
        }
      }
      store.execute(q)
      observers.append(q)
      store.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
    }
  }
}
