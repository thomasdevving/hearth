import Foundation
import Observation
import SwiftData

/// App state shared by the screens, and the daily loop (docs/04 §8, docs/02 §7):
/// collect → `dailyUpdate` for every unprocessed day, oldest first → inbox items.
@MainActor @Observable
final class AppModel {
  let store: Store
  let router: InferenceRouter

  /// Bumped after every write, so screens re-read the store.
  var revision = 0
  /// Backfill progress while days are being scored.
  var progress: (done: Int, total: Int)?
  var status: String?
  /// Non-nil while the safety screen is shown (R7). The value is the entry point.
  var safetyEntry: String?
  var selectedTab: Tab = .today
  var path: [Route] = []

  enum Tab: Hashable { case today, trends, plan, ledger, settings }

  /// Days are scored once they have ended. The engine keeps 120 days of reference, so the
  /// first run reads 120 days back (docs/03 §1).
  static let backfillDays = 120

  private var running = false
  private var pendingRun = false

  init(store: Store) {
    self.store = store
    self.router = InferenceRouter(store: store)
  }

  func changed() { store.save(); revision += 1 }

  var settings: HearthSettings { store.settings }

  // Derived values for the screens --------------------------------------------------------

  var engineState: EngineStateValue? { store.engineState?.value }
  var latestRecord: DayRecordValue? { store.records().last?.value }
  var currentState: EngineStateName { latestRecord?.state ?? engineState?.state ?? .WARM_UP }

  // The daily loop --------------------------------------------------------------------------

  /// On app open, from background refresh and from HealthKit observers. Runs once at a time;
  /// a call during a run schedules one more run.
  func runDaily(reason: String) async {
    if running { pendingRun = true; return }
    running = true
    defer { running = false }
    repeat {
      pendingRun = false
      await collect()
      await processDays()
      buildWeeks()
      closeStale()
      changed()
      await Notifications.scheduleIfDue(store: store)
    } while pendingRun
  }

  /// Reads HealthKit into day_raw: 120 days on the first run, afterwards from two days before
  /// the last complete day, so late-syncing watch data is picked up.
  func collect() async {
    let s = settings
    let today = Clock.today
    #if DEBUG
    if DemoData.enabled {
      DemoData.fill(store: store, days: Self.backfillDays)
      return
    }
    #endif
    guard s.healthAuthorized, HealthKitCollector.isAvailable else { return }
    let lastComplete = store.all(DayRaw.self, sort: [SortDescriptor(\.date, order: .reverse)]).first { $0.complete }?.date
    let from = lastComplete.map { Clock.addDays($0, -2) } ?? Clock.addDays(today, -Self.backfillDays)
    status = lastComplete == nil ? "Reading your Health history…" : nil
    do {
      let switches = HealthKitCollector.Switches(steps: s.sensorSteps, walkingSpeed: s.sensorWalkingSpeed, sleep: s.sensorSleep, heart: s.sensorHeart)
      let days = try await HealthKitCollector.shared.read(from: from, to: today, switches: switches)
      for (date, var fields) in days {
        let existing = store.raw(date)
        // Keep visits that the location collector already wrote.
        if let e = existing, let old = JSONText.object(e.json) as? [String: Any], let v = old["visits"], !(v is NSNull) { fields["visits"] = v }
        let json = JSONText.encode(fields)
        let complete = date < today
        if let e = existing {
          // A day already scored keeps its record (dailyUpdate is idempotent); its raw is refreshed.
          e.json = json; e.complete = e.complete || complete; e.fetchedAt = .now
        } else {
          store.context.insert(DayRaw(date: date, json: json, complete: complete))
        }
      }
      store.save()
    } catch {
      // Locked device (protected data) or no permission: try again next time.
      status = nil
    }
    status = nil
  }

  /// Runs dailyUpdate for each unprocessed, complete day in order. Actions of days before
  /// yesterday are dropped: they belong to the past (backfill), and turning them into
  /// unanswered check-ins would count as ignored prompts.
  func processDays() async {
    let today = Clock.today
    let yesterday = Clock.addDays(today, -1)
    let raws = store.all(DayRaw.self, sort: [SortDescriptor(\.date)])
    guard let firstRaw = raws.first?.date else { return }
    if store.engineState == nil {
      let seed = Int.random(in: 1..<2_147_483_647)
      if let s = try? Engine.shared.call("initialState", seed) { store.putEngineState(s); store.save() }
    }
    guard var stateJSON = store.engineState?.json else { return }
    let last = store.engineState?.value?.lastProcessedDate
    var date = last.map { Clock.addDays($0, 1) } ?? firstRaw
    // Only days that are over and whose HealthKit read happened after they ended.
    var todo: [String] = []
    let complete = Dictionary(raws.map { ($0.date, $0.complete) }, uniquingKeysWith: { a, _ in a })
    while date <= yesterday {
      if complete[date] != true && !DemoData.enabled { break }
      todo.append(date)
      date = Clock.addDays(date, 1)
    }
    guard !todo.isEmpty else { return }

    let rawJSON = Dictionary(raws.map { ($0.date, $0.json) }, uniquingKeysWith: { a, _ in a })
    var history = store.records().map(\.json)
    let rules = store.all(PlanRule.self).filter { $0.value?.active == true }.map { RawJSON($0.json) }
    let contexts = store.all(ContextLabel.self).filter(\.confirmed).map { RawJSON($0.json) }
    let questionnaires = store.all(QuestionnaireRecord.self).map { RawJSON($0.json) }
    let cfg = Shared.config
    if todo.count > 1 { progress = (0, todo.count) }
    defer { progress = nil }

    for (i, d) in todo.enumerated() {
      let from = Clock.addDays(d, -69)
      let windowRaws = rawJSON.filter { $0.key >= from && $0.key <= d }.sorted { $0.key < $1.key }.map { RawJSON($0.value) }
      let since14 = Clock.addDays(d, -14)
      let checkins = store.all(CheckinRecord.self).filter { String($0.scheduledAt.prefix(10)) > since14 }.map { RawJSON($0.json) }
      let input: [String: Any] = [
        "date": d, "raws": windowRaws, "history": history.map { RawJSON($0) }, "state": RawJSON(stateJSON),
        "rules": rules, "contexts": contexts, "checkins": checkins, "questionnaires": questionnaires, "cfg": cfg,
      ]
      let out: String
      do { out = try await Engine.shared.callAsync("dailyUpdate", argsJSON: JSONText.array([input])) } catch {
        status = "Could not score \(d): \(error)"
        break
      }
      guard let obj = JSONText.object(out) as? [String: Any],
            let record = obj["record"], let state = obj["state"] else { break }
      let recordJSON = JSONText.encode(record)
      stateJSON = JSONText.encode(state)
      let recState = (record as? [String: Any])?["state"] as? String ?? "WARM_UP"
      if let existing = store.record(d) { existing.json = recordJSON; existing.state = recState } else {
        store.context.insert(DayRecord(date: d, json: recordJSON, state: recState))
      }
      history.append(recordJSON)
      store.putEngineState(stateJSON)
      if d >= yesterday, let actionsAny = obj["actions"] {
        let actions = (try? JSONText.decode([EngineAction].self, JSONText.encode(actionsAny))) ?? []
        apply(actions, processedDate: d, previousState: history.count >= 2 ? (try? JSONText.decode(DayRecordValue.self, history[history.count - 2]))?.state : nil)
      }
      if todo.count > 1 { progress = (i + 1, todo.count) }
      if i % 10 == 9 { store.save(); revision += 1 }
    }
    store.save()
  }

  /// Engine actions → inbox items for today (docs/04 §8, web runtime `processDay`).
  private func apply(_ actions: [EngineAction], processedDate: String, previousState: EngineStateName?) {
    let today = Clock.today
    let fixed = settings.scheduleMode == "fixed"
    for a in actions {
      switch a.type {
      case "schedule_checkin":
        if fixed { continue }
        createCheckin(kind: a.kind ?? "random", reasons: a.reasons ?? [], date: today)
      case "offer_questionnaire":
        guard let inst = a.id else { continue }
        if store.openInbox().contains(where: { $0.type == "questionnaire" && $0.instrument == inst }) { continue }
        store.addInbox("questionnaire", date: today) { $0.instrument = inst; $0.reason = a.reason }
      case "show_plan":
        let episodeStart = previousState != .ELEVATED && previousState != .CONFIRMED
        if episodeStart { store.addInbox("show_plan", date: today) }
      case "context_expired":
        store.addInbox("context_expired", date: today) { $0.contextId = a.contextId }
      default: break
      }
    }
    if fixed {
      // Fixed schedule: a check-in every cfg.fixedScheduleDays days (docs/04 §9).
      let every = (JSONText.object(Shared.configJSON) as? [String: Any])?["fixedScheduleDays"] as? Int ?? 3
      let n = Clock.calendar.dateComponents([.day], from: Clock.startOfDay("2026-01-01"), to: Clock.startOfDay(processedDate)).day ?? 0
      if n % every == 0 { createCheckin(kind: "fixed", reasons: [], date: today) }
    }
  }

  func createCheckin(kind: String, reasons: [Contributor], date: String) {
    let id = newId("checkin")
    let rec: [String: Any] = [
      "id": id, "scheduledAt": Clock.nowStamp, "answeredAt": NSNull(), "kind": kind,
      "reasons": reasons.map { ["feature": $0.feature, "r": $0.r, "phrase": $0.phrase] },
      "answers": [String: Any](), "personalAnswers": [String: Any](), "hasFreeText": false,
    ]
    store.context.insert(CheckinRecord(id: id, json: JSONText.encode(rec), scheduledAt: Clock.nowStamp))
    store.addInbox("checkin", date: date) { $0.checkinId = id; $0.reason = kind }
  }

  /// Weekly aggregates for every finished ISO week with scored days (docs/07 §3). Upload needs
  /// cloud consent and a Firebase project; neither exists in this build.
  func buildWeeks() {
    let records = store.records()
    guard let first = records.first?.date, let last = records.last?.date else { return }
    var weeks = Set<String>()
    var d = first
    while d <= last {
      if let w = try? JSONText.decode(String.self, Engine.shared.call("isoWeekOf", d)) { weeks.insert(w) }
      d = Clock.addDays(d, 7)
    }
    if let w = try? JSONText.decode(String.self, Engine.shared.call("isoWeekOf", last)) { weeks.insert(w) }
    let existing = Set(store.all(WeekAggregate.self).map(\.isoWeek))
    for w in weeks where !existing.contains(w) {
      guard let dates = try? JSONText.decode([String].self, Engine.shared.call("datesOfIsoWeek", w)), let sunday = dates.last, sunday <= last else { continue }
      let inWeek = { (x: String) in x >= dates[0] && x <= sunday }
      let markers = store.all(DiaryEntry.self).filter { inWeek($0.date) }.compactMap { $0.markersJSON.map(RawJSON.init) }
      let input: [String: Any] = [
        "isoWeek": w,
        "records": records.filter { inWeek($0.date) }.map { RawJSON($0.json) },
        "checkins": store.all(CheckinRecord.self).map { RawJSON($0.json) },
        "questionnaires": store.all(QuestionnaireRecord.self).map { RawJSON($0.json) },
        "contexts": store.all(ContextLabel.self).map { RawJSON($0.json) },
        "markers": markers, "note": NSNull(),
      ]
      if let agg = try? Engine.shared.call("aggregateWeek", input) {
        store.context.insert(WeekAggregate(isoWeek: w, json: agg, uploaded: false))
      }
    }
  }

  /// Items of earlier days are closed; an unanswered check-in counts as ignored.
  func closeStale() {
    let today = Clock.today
    for item in store.openInbox() where item.date < today && item.type != "context_confirm" {
      store.close(item, "dismissed")
    }
  }

  /// A visit from CLVisit, added to day_raw for every date it overlaps (S3, local only).
  func addVisit(arrive: Date, depart: Date, lat: Double, lon: Double) {
    var d = Clock.day(arrive)
    let end = Clock.day(depart)
    let visit: [String: Any] = ["arrive": Clock.stamp(arrive), "depart": Clock.stamp(depart), "lat": lat, "lon": lon]
    while d <= end {
      let raw = store.raw(d)
      var obj = (raw.flatMap { JSONText.object($0.json) as? [String: Any] }) ?? ["date": d, "stepBins15": NSNull(), "walkingSpeed": NSNull(), "sleep": NSNull(), "phone": NSNull(), "heart": NSNull()]
      var visits = (obj["visits"] as? [Any]) ?? []
      visits.append(visit)
      obj["visits"] = visits
      if let raw { raw.json = JSONText.encode(obj) } else { store.context.insert(DayRaw(date: d, json: JSONText.encode(obj), complete: false)) }
      d = Clock.addDays(d, 1)
    }
    store.save()
  }

  // Safety (docs/06 §4) -------------------------------------------------------------------

  func openSafety(_ entry: String) {
    store.context.insert(SafetyEvent(id: newId("safety"), at: Clock.nowStamp, entry: entry))
    store.save()
    safetyEntry = entry
  }
}

enum Route: Hashable {
  case checkin(String)
  case questionnaire(String)
  case result(String, baseline: Bool)
  case contextConfirm(String)
  case planSetup(first: Bool)
  case myPlan
  case baselinePhq
  case weekly
  case people
  /// Why? for one signal (feature id), from the phrases under Why? on Today.
  case why(String)
}
