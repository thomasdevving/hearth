import SwiftData
import XCTest
@testable import Hearth

/// Why?: the usual range and the timeline come from the engine and decode into the Swift types.
@MainActor
final class WhyTests: XCTestCase {
  private var container: ModelContainer!
  private var app: AppModel!

  override func setUp() async throws {
    container = try Store.makeContainer(inMemory: true)
    app = AppModel(store: Store(context: container.mainContext))
    app.settings.onDeviceEnabled = false
  }

  func testNullsInEngineOutputDecode() throws {
    let points = try JSONText.decode([UsualPoint].self, #"[{"date":"2026-11-01","value":null,"median":null,"low":null,"high":null,"z":null},{"date":"2026-11-02","value":5,"median":4,"low":3,"high":5,"z":1}]"#)
    XCTAssertNil(points[0].median)
    XCTAssertEqual(points[1].high, 5)
    let none = try JSONText.decode(WhyTimelineValue.self, #"{"episode":null,"singleDay":null,"risingDays":0}"#)
    XCTAssertNil(none.episode)
    let some = try JSONText.decode(WhyTimelineValue.self, #"{"episode":{"start":"2026-11-10","end":null},"singleDay":{"date":"2026-10-30","D":2.1,"UCL":1.4},"risingDays":4}"#)
    XCTAssertEqual(some.episode?.start, "2026-11-10")
    XCTAssertEqual(some.singleDay?.UCL, 1.4)
  }

  #if DEBUG
  /// 120 demo days drifting over the last two weeks → a changed state; Why? for its first
  /// contributor gets 42 days of usual range whose band matches the engine's z-scores, and a
  /// timeline that starts on the first changed day.
  func testSeriesAndTimelineFromTheEngine() async throws {
    DemoData.fill(store: app.store, days: 120, change: true)
    app.settings.liveFrom = "2000-01-01" // score the demo days as live days
    await app.processDays()
    let records = app.store.records().compactMap(\.value)
    XCTAssertEqual(records.count, 120)
    let last = try XCTUnwrap(records.last)
    XCTAssertTrue(last.state == .ELEVATED || last.state == .CONFIRMED, "demo drift should end changed, got \(last.state)")
    let feature = try XCTUnwrap(last.contributors.first?.feature)

    let why = try XCTUnwrap(try WhyData.load(store: app.store, feature: feature))
    XCTAssertEqual(why.series.count, WhyData.windowDays)
    XCTAssertEqual(why.series.first?.date, why.from)
    XCTAssertEqual(why.series.last?.date, last.date)
    XCTAssertEqual(why.records.count, WhyData.windowDays)

    // The band is the range the engine scored against: z = (value − median) / (high − median).
    let usable = why.series.filter { $0.z != nil && $0.value != nil && $0.median != nil && $0.high != nil && $0.high != $0.median }
    XCTAssertGreaterThan(usable.count, 20)
    for p in usable where abs(p.z!) < 4 {
      XCTAssertEqual((p.value! - p.median!) / (p.high! - p.median!), p.z!, accuracy: 1e-6, p.date)
    }
    let lastPoint = try XCTUnwrap(why.lastPoint)
    XCTAssertGreaterThan(abs(lastPoint.z ?? 0), 1, "the contributor is outside its usual range")

    let episode = try XCTUnwrap(why.timeline.episode)
    XCTAssertNil(episode.end)
    let firstChanged = records.lastIndex { $0.state != .ELEVATED && $0.state != .CONFIRMED }.map { records[$0 + 1].date }
    XCTAssertEqual(episode.start, firstChanged)
    XCTAssertTrue(why.marks.contains { $0.label == "Hearth noticed" && $0.date == episode.start })
  }
  #endif
}
