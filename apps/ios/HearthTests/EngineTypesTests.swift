import XCTest
@testable import Hearth

/// The Swift mirrors of the engine types must decode the engine's real output.
final class EngineTypesTests: XCTestCase {
  private func fixture(_ name: String) throws -> [String: Any] {
    let url = Bundle(for: Self.self).resourceURL!.appendingPathComponent("fixtures/\(name).json")
    return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
  }

  func testDayRecordAndStateDecode() throws {
    for name in ["daily_update_first_monitor", "daily_update_first_elevated", "daily_update_warm_up", "daily_update_holiday_masked"] {
      let out = try XCTUnwrap(try fixture(name)["expectedOutput"] as? [String: Any])
      let record = JSONText.encode(out["record"])
      do { _ = try JSONText.decode(DayRecordValue.self, record) } catch { XCTFail("\(name) record: \(error)") }
      do { _ = try JSONText.decode(EngineStateValue.self, JSONText.encode(out["state"])) } catch { XCTFail("\(name) state: \(error)") }
      do { _ = try JSONText.decode([EngineAction].self, JSONText.encode(out["actions"])) } catch { XCTFail("\(name) actions: \(error)") }
    }
  }
}

final class JSONTextTests: XCTestCase {
  func testNumbersAndBooleansStayApart() throws {
    let parsed = try XCTUnwrap(JSONText.object(#"{"a":1,"b":0,"c":true,"d":false,"e":1.5,"f":null}"#))
    XCTAssertEqual(JSONText.encode(parsed), #"{"a":1,"b":0,"c":true,"d":false,"e":1.5,"f":null}"#)
    let swift: [String: Any] = ["i": 1, "z": 0, "t": true, "x": 0.1, "n": NSNull(), "s": "a\"b"]
    XCTAssertEqual(JSONText.encode(swift), #"{"i":1,"n":null,"s":"a\"b","t":true,"x":0.1,"z":0}"#)
  }

  /// Round trip through the engine keeps every number exactly.
  func testRoundTripThroughEngineIsExact() throws {
    let url = Bundle(for: Self.self).resourceURL!.appendingPathComponent("fixtures/daily_update_first_monitor.json")
    let fx = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    let input = try XCTUnwrap(fx["input"])
    let out = try Engine(bundle: .main).call("dailyUpdate", argsJSON: JSONText.encode(input))
    let actual = try XCTUnwrap(JSONText.object(out))
    XCTAssertNil(JSONDiff.first(actual, fx["expectedOutput"]!, path: ""))
  }
}
