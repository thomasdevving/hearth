import SwiftData
import XCTest
@testable import Hearth

/// The plan: the user's own smaller steps and the day's choices (stored on the device), and
/// "What came first" from the engine's `signalOnset`.
@MainActor
final class PlanTests: XCTestCase {
  private var container: ModelContainer!
  private var app: AppModel!

  override func setUp() async throws {
    container = try Store.makeContainer(inMemory: true)
    app = AppModel(store: Store(context: container.mainContext))
    app.settings.onDeviceEnabled = false
  }

  private func addAction(_ id: String, _ text: String) {
    let obj: [String: Any] = ["id": id, "text": text, "quote": text.lowercased(), "active": true]
    app.store.context.insert(PlanAction(id: id, json: JSONText.encode(obj)))
    app.store.save()
  }

  // Smaller step -----------------------------------------------------------------------------

  func testCleanSmaller() {
    XCTAssertEqual(SmallerStep.clean("  Ten   minutes\n tonight  "), "Ten minutes tonight")
    XCTAssertNil(SmallerStep.clean("   \n "))
    XCTAssertEqual(SmallerStep.clean(String(repeating: "a", count: 300))?.count, SmallerStep.maxLength)
  }

  func testSetSmallerKeepsTheActionAndClears() throws {
    addAction("action_a", "Go for a walk")
    app.store.setSmaller(actionId: "action_a", text: "  Step outside  for five minutes ")
    var a = try XCTUnwrap(app.store.activeActions().first)
    XCTAssertEqual(a.smaller, "Step outside for five minutes")
    XCTAssertEqual(a.text, "Go for a walk")
    XCTAssertTrue(a.active)
    // The stored JSON keeps the engine's field names, so it goes back into the engine unchanged.
    let json = try XCTUnwrap(app.store.all(PlanAction.self).first?.json)
    XCTAssertEqual((JSONText.object(json) as? [String: Any])?["smaller"] as? String, "Step outside for five minutes")
    app.store.setSmaller(actionId: "action_a", text: "   ")
    a = try XCTUnwrap(app.store.activeActions().first)
    XCTAssertNil(a.smaller)
  }

  func testOldActionsWithoutSmallerDecode() throws {
    let a = try JSONText.decode(PlanActionValue.self, #"{"id":"a","text":"Walk","quote":"walk","active":true}"#)
    XCTAssertNil(a.smaller)
  }

  func testOneChoicePerActionPerDay() {
    app.store.chooseVersion(actionId: "a", date: "2026-11-20", choice: .full)
    app.store.chooseVersion(actionId: "a", date: "2026-11-20", choice: .smaller)
    app.store.chooseVersion(actionId: "b", date: "2026-11-20", choice: .full)
    let choices = app.store.actionChoices()
    XCTAssertEqual(choices.count, 2)
    XCTAssertEqual(choices.first { $0.actionId == "a" }?.choice, .smaller)
    XCTAssertEqual(app.store.all(ActionChoice.self).first { $0.actionId == "a" }?.id, "a_2026-11-20")
  }

  func testSummarizeChoices() {
    let choices: [ActionChoiceValue] = [
      .init(actionId: "a", date: "2026-11-18", choice: .full),
      .init(actionId: "a", date: "2026-11-21", choice: .smaller),
      .init(actionId: "a", date: "2026-11-19", choice: .full),
      .init(actionId: "a", date: "2026-11-23", choice: .full),
      .init(actionId: "b", date: "2026-11-22", choice: .full),
    ]
    let s = SmallerStep.summarize(choices, actionId: "a", today: "2026-11-23")
    XCTAssertEqual(s.today, .full)
    XCTAssertEqual(s.last, .init(actionId: "a", date: "2026-11-21", choice: .smaller))
    XCTAssertEqual(s.full, 2)
    XCTAssertEqual(s.smaller, 1)
    let none = SmallerStep.summarize(choices, actionId: "c", today: "2026-11-23")
    XCTAssertEqual(none, .init(today: nil, last: nil, full: 0, smaller: 0))
  }

  func testDeleteEverythingRemovesChoices() {
    app.store.chooseVersion(actionId: "a", date: "2026-11-20", choice: .full)
    app.store.deleteEverything()
    XCTAssertTrue(app.store.actionChoices().isEmpty)
  }

  // Task K -----------------------------------------------------------------------------------

  func testPickForTodayWithoutModelShowsAll() async {
    addAction("action_a", "Go for a walk")
    addAction("action_b", "Call my sister")
    let pick = await app.pickForToday(actions: app.store.activeActions(), today: ["fewer steps than usual"])
    XCTAssertNil(pick)
    let entry = app.store.all(LedgerEntry.self).compactMap(\.value).first
    XCTAssertEqual(entry?.task, "K")
    XCTAssertEqual(entry?.dataClass, "S3")
    XCTAssertEqual(entry?.ranOn, "none")
  }

  func testTaskKOutputIsCheckedAgainstThePlan() throws {
    let ctx: [String: Any] = ["actionIds": ["action_a", "action_b"]]
    let ok = try XCTUnwrap(JSONText.object(Engine.shared.call("verifyTask", "K", ["action_ids": ["action_b", "action_b"]], ctx)) as? [String: Any])
    XCTAssertEqual(ok["ok"] as? Bool, true)
    XCTAssertEqual((ok["value"] as? [String: Any])?["action_ids"] as? [String], ["action_b"])
    let bad = try XCTUnwrap(JSONText.object(Engine.shared.call("verifyTask", "K", ["action_ids": ["action_x"]], ctx)) as? [String: Any])
    XCTAssertEqual(bad["ok"] as? Bool, false)
  }

  // What came first --------------------------------------------------------------------------

  func testOnsetDecodes() throws {
    let json = #"{"episode":{"start":"2026-11-10","end":null},"moved":[{"feature":"rest_midpoint","ruleId":"rule_1","firstDate":"2026-11-05","daysBefore":5,"direction":"later"},{"feature":"place_visits:p1","ruleId":null,"firstDate":"2026-11-07","daysBefore":3,"direction":"lower"}],"unchanged":[{"feature":"steps","ruleId":"rule_2","firstDate":null,"daysBefore":null,"direction":null}]}"#
    let r = try JSONText.decode(OnsetResultValue.self, json)
    XCTAssertEqual(r.episode.start, "2026-11-10")
    XCTAssertNil(r.episode.end)
    XCTAssertEqual(r.moved.map(\.daysBefore), [5, 3])
    XCTAssertNil(r.moved[1].ruleId)
    XCTAssertNil(r.unchanged[0].firstDate)
    XCTAssertEqual(OnsetData.when(r.moved[0]), "5 days before Hearth noticed")
    XCTAssertEqual(OnsetData.when(.init(feature: "x", daysBefore: 1)), "the day before Hearth noticed")
    XCTAssertEqual(OnsetData.when(.init(feature: "x", daysBefore: 0)), "the day Hearth noticed")
    XCTAssertEqual(OnsetData.when(.init(feature: "x", daysBefore: -1)), "a day after")
    XCTAssertEqual(OnsetData.when(.init(feature: "x", daysBefore: -4)), "4 days after")
  }

  func testShownKeepsOwnSignsAndTheEarliestOthers() {
    let moved: [SignalOnsetValue] = [
      .init(feature: "a", firstDate: "2026-11-01"), .init(feature: "b", firstDate: "2026-11-02"),
      .init(feature: "c", firstDate: "2026-11-03"), .init(feature: "own", ruleId: "r", firstDate: "2026-11-03"),
      .init(feature: "d", firstDate: "2026-11-04"),
    ]
    let d = OnsetData(result: .init(episode: .init(start: "2026-11-05"), moved: moved, unchanged: []))
    XCTAssertEqual(d.shown.map(\.feature), ["a", "b", "own", "c"])
  }

  func testWatchTooNeedsTheUsersWords() throws {
    let o = SignalOnsetValue(feature: "place_visits:p1", firstDate: "2026-11-01", daysBefore: 4, direction: "lower")
    XCTAssertFalse(app.store.watchToo(o, quote: "  a "))
    XCTAssertTrue(app.store.activeRules().isEmpty)
    XCTAssertTrue(app.store.watchToo(o, quote: "  I stop going to the gym "))
    let r = try XCTUnwrap(app.store.activeRules().first)
    XCTAssertEqual(r.feature, "place_visits")
    XCTAssertEqual(r.placeId, "p1")
    XCTAssertEqual(r.direction, "lower")
    XCTAssertEqual(r.quote, "I stop going to the gym")
  }

  #if DEBUG
  /// Demo drift with the rest-midpoint sign: the engine finds the stretch, the sign moved before
  /// Hearth noticed, and the result decodes.
  func testOnsetFromTheEngine() async throws {
    DemoData.fill(store: app.store, days: 120, change: true)
    app.settings.liveFrom = "2000-01-01" // score the demo days as live days
    DemoData.addRule(store: app.store)
    await app.processDays()
    let d = try XCTUnwrap(try OnsetData.load(store: app.store))
    let start = try XCTUnwrap(try WhyData.load(store: app.store, feature: "steps")?.timeline.episode?.start)
    XCTAssertEqual(d.result.episode.start, start)
    XCTAssertFalse(d.shown.isEmpty)
    XCTAssertEqual(d.shown.map { $0.firstDate ?? "" }, d.shown.map { $0.firstDate ?? "" }.sorted())
    let own = d.shown.first { $0.ruleId == "rule_demo" } ?? d.result.unchanged.first { $0.ruleId == "rule_demo" }
    XCTAssertNotNil(own, "the demo sign is either moved or unchanged")
  }
  #endif
}
