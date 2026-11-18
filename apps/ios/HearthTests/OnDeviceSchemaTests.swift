import FoundationModels
import XCTest
@testable import Hearth

/// Every task schema in shared/schemas converts to a valid Foundation Models schema.
final class OnDeviceSchemaTests: XCTestCase {
  func testAllSchemasConvert() throws {
    let dir = Bundle.main.resourceURL!.appendingPathComponent("shared/schemas")
    let files = try FileManager.default.contentsOfDirectory(atPath: dir.path).filter { $0.hasSuffix(".schema.json") }
    XCTAssertGreaterThanOrEqual(files.count, 13)
    for f in files {
      let id = f.replacingOccurrences(of: ".schema.json", with: "")
      let root = OnDeviceModel.dynamicSchema(Shared.schema(id), name: "Task\(id)")
      XCTAssertNoThrow(try GenerationSchema(root: root, dependencies: []), id)
    }
  }
}
