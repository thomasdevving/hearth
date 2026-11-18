import XCTest
@testable import Hearth

/// docs/09 M8: every golden fixture in packages/engine/test/fixtures/*.json runs through the
/// JavaScriptCore bridge and must equal `expectedOutput` exactly (numbers bit for bit).
/// The fixtures are copied into the test bundle by scripts/copy-resources.sh.
final class GoldenFixtureTests: XCTestCase {
  private var fixtureURLs: [URL] {
    let bundle = Bundle(for: GoldenFixtureTests.self)
    let dir = bundle.resourceURL!.appendingPathComponent("fixtures")
    let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
    return files.filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
  }

  func testFixturesExist() {
    XCTAssertGreaterThanOrEqual(fixtureURLs.count, 20, "golden fixtures were not copied into the test bundle")
  }

  func testEveryFixtureMatchesExactly() throws {
    let engine = try Engine(bundle: .main)
    var failures: [String] = []
    for url in fixtureURLs {
      let data = try Data(contentsOf: url)
      let fixture = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
      let fn = try XCTUnwrap(fixture["fn"] as? String)
      let input = try XCTUnwrap(fixture["input"])
      let inputJSON = String(decoding: try JSONSerialization.data(withJSONObject: input, options: [.fragmentsAllowed]), as: UTF8.self)
      let outJSON = try engine.call(fn, argsJSON: inputJSON)
      let actual = try JSONSerialization.jsonObject(with: Data(outJSON.utf8), options: [.fragmentsAllowed])
      let expected = fixture["expectedOutput"] ?? NSNull()
      if let diff = JSONDiff.first(actual, expected, path: "") {
        failures.append("\(url.lastPathComponent): \(diff)")
      }
    }
    XCTAssertTrue(failures.isEmpty, failures.joined(separator: "\n"))
  }

  /// The comparison itself must catch a one-bit difference.
  func testComparisonIsExact() {
    XCTAssertNotNil(JSONDiff.first(0.7503419772762425 as Double, 0.7503419772762429 as Double, path: ""))
    XCTAssertNotNil(JSONDiff.first(true, 1, path: ""))
    XCTAssertNil(JSONDiff.first(["a": [1, 2.5, NSNull()]], ["a": [1, 2.5, NSNull()]], path: ""))
  }
}

enum JSONDiff {
  /// The first difference between two JSONSerialization trees, or nil when they are equal.
  /// Booleans are not numbers; numbers are compared as doubles with ==; key sets must match.
  static func first(_ a: Any, _ b: Any, path: String) -> String? {
    switch (a, b) {
    case (is NSNull, is NSNull):
      return nil
    case let (x as [String: Any], y as [String: Any]):
      let keys = Set(x.keys).union(y.keys).sorted()
      for k in keys {
        guard let xv = x[k] else { return "\(path).\(k): missing in output" }
        guard let yv = y[k] else { return "\(path).\(k): unexpected in output" }
        if let d = first(xv, yv, path: "\(path).\(k)") { return d }
      }
      return nil
    case let (x as [Any], y as [Any]):
      if x.count != y.count { return "\(path): length \(x.count) vs \(y.count)" }
      for i in x.indices { if let d = first(x[i], y[i], path: "\(path)[\(i)]") { return d } }
      return nil
    case let (x as String, y as String):
      return x == y ? nil : "\(path): \"\(x)\" vs \"\(y)\""
    case let (x as NSNumber, y as NSNumber):
      let xb = CFGetTypeID(x) == CFBooleanGetTypeID(), yb = CFGetTypeID(y) == CFBooleanGetTypeID()
      if xb != yb { return "\(path): boolean vs number" }
      if xb { return x.boolValue == y.boolValue ? nil : "\(path): \(x.boolValue) vs \(y.boolValue)" }
      return x.doubleValue == y.doubleValue ? nil : "\(path): \(x.doubleValue) vs \(y.doubleValue)"
    case let (x as Double, y as Double):
      return x == y ? nil : "\(path): \(x) vs \(y)"
    default:
      return "\(path): \(type(of: a)) vs \(type(of: b))"
    }
  }
}
