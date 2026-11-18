import Foundation
import JavaScriptCore

/// The engine on iOS: `packages/engine/dist/engine.js` (global `HearthEngine`) running in
/// JavaScriptCore. JSON strings in and out (docs/02 §4). No engine logic lives in Swift.
///
/// One JSContext, guarded by a lock: JavaScriptCore contexts must not be used from two
/// threads at once. Heavy calls (the 120-day backfill) run off the main thread through
/// `callAsync`.
final class Engine: @unchecked Sendable {
  enum EngineError: Error, CustomStringConvertible {
    case missingResource(String)
    case unknownFunction(String)
    case jsException(String)
    case badJSON(String)
    var description: String {
      switch self {
      case .missingResource(let s): return "missing bundle resource \(s)"
      case .unknownFunction(let s): return "engine has no function \(s)"
      case .jsException(let s): return "engine threw: \(s)"
      case .badJSON(let s): return "bad JSON: \(s)"
      }
    }
  }

  static let shared: Engine = {
    do { return try Engine(bundle: .main) } catch { fatalError("Engine failed to load: \(error)") }
  }()

  private let context: JSContext
  private let callFn: JSValue
  private let lock = NSLock()
  private let queue = DispatchQueue(label: "hearth.engine", qos: .userInitiated)

  init(bundle: Bundle) throws {
    guard let ctx = JSContext() else { throw EngineError.jsException("no JSContext") }
    context = ctx
    var lastException: String?
    ctx.exceptionHandler = { _, exc in lastException = exc?.toString() }
    // v8math.js first: bit-exact Math.log/exp/sin/... matching the Node build of the fixtures.
    for name in ["v8math", "engine"] {
      guard let url = bundle.url(forResource: name, withExtension: "js", subdirectory: "Engine"),
            let src = try? String(contentsOf: url, encoding: .utf8) else {
        throw EngineError.missingResource("Engine/\(name).js")
      }
      ctx.evaluateScript(src, withSourceURL: url)
      if let e = lastException { throw EngineError.jsException("\(name).js: \(e)") }
    }
    ctx.evaluateScript("""
      var __hearthCall = function (fn, argsJson) {
        var f = HearthEngine[fn];
        if (typeof f !== "function") throw new Error("unknown engine function " + fn);
        var out = f.apply(null, JSON.parse(argsJson));
        return JSON.stringify(out === undefined ? null : out);
      };
      var __hearthValue = function (name) { return JSON.stringify(HearthEngine[name]); };
      """)
    guard let fn = ctx.objectForKeyedSubscript("__hearthCall"), !fn.isUndefined else {
      throw EngineError.jsException("bridge setup failed")
    }
    callFn = fn
    ctx.exceptionHandler = nil
  }

  /// `Engine.call("dailyUpdate", "[{...}]") -> "{...}"`. `argsJSON` is the JSON array of arguments.
  func call(_ fn: String, argsJSON: String) throws -> String {
    lock.lock(); defer { lock.unlock() }
    var thrown: String?
    context.exceptionHandler = { _, exc in thrown = exc?.toString() }
    defer { context.exceptionHandler = nil }
    let out = callFn.call(withArguments: [fn, argsJSON])
    if let t = thrown { throw EngineError.jsException("\(fn): \(t)") }
    guard let s = out?.toString(), out?.isString == true else { throw EngineError.jsException("\(fn): no result") }
    return s
  }

  /// Arguments as Foundation values (dictionaries, arrays, strings, numbers, NSNull, or
  /// `RawJSON` fragments that are inserted verbatim).
  func call(_ fn: String, _ args: Any...) throws -> String {
    try call(fn, argsJSON: JSONText.array(args))
  }

  func callAsync(_ fn: String, argsJSON: String) async throws -> String {
    try await withCheckedThrowingContinuation { cont in
      queue.async {
        do { cont.resume(returning: try self.call(fn, argsJSON: argsJSON)) } catch { cont.resume(throwing: error) }
      }
    }
  }

  /// The JSON of an exported constant, e.g. `TASKS`, `defaultConfig`, `QUESTIONNAIRES`.
  func value(_ name: String) throws -> String {
    lock.lock(); defer { lock.unlock() }
    guard let s = context.objectForKeyedSubscript("__hearthValue")?.call(withArguments: [name])?.toString(), s != "undefined" else {
      throw EngineError.unknownFunction(name)
    }
    return s
  }

  // Typed conveniences --------------------------------------------------------------

  func decode<T: Decodable>(_ type: T.Type, _ fn: String, _ args: Any...) throws -> T {
    let s = try call(fn, argsJSON: JSONText.array(args))
    return try JSONText.decode(type, s)
  }
}

/// A JSON fragment passed through unchanged (stored engine records, the config).
struct RawJSON {
  let text: String
  init(_ text: String) { self.text = text }
}

enum JSONText {
  /// Serialises Foundation values; `RawJSON` is spliced in as is, `nil`/NSNull become `null`.
  static func encode(_ v: Any?) -> String {
    guard let v else { return "null" }
    switch v {
    case let r as RawJSON: return r.text
    case is NSNull: return "null"
    case let s as String: return quote(s)
    // Numbers before Bool: `NSNumber(1) as? Bool` succeeds in Swift, so a 0 or 1 from
    // JSONSerialization would otherwise be written as a boolean. Only a real CFBoolean is one.
    case let n as NSNumber:
      if CFGetTypeID(n) == CFBooleanGetTypeID() { return n.boolValue ? "true" : "false" }
      return number(n.doubleValue)
    case let a as [Any?]: return "[" + a.map(encode).joined(separator: ",") + "]"
    case let a as [Any]: return "[" + a.map { encode($0) }.joined(separator: ",") + "]"
    case let d as [String: Any?]:
      return "{" + d.keys.sorted().map { quote($0) + ":" + encode(d[$0] ?? nil) }.joined(separator: ",") + "}"
    case let d as [String: Any]:
      return "{" + d.keys.sorted().map { quote($0) + ":" + encode(d[$0]) }.joined(separator: ",") + "}"
    case let e as Encodable:
      let data = (try? JSONEncoder().encode(AnyEncodable(e))) ?? Data("null".utf8)
      return String(decoding: data, as: UTF8.self)
    default:
      return "null"
    }
  }

  static func array(_ items: [Any]) -> String { "[" + items.map { encode($0) }.joined(separator: ",") + "]" }

  static func quote(_ s: String) -> String {
    var out = "\""
    for u in s.unicodeScalars {
      switch u {
      case "\"": out += "\\\""
      case "\\": out += "\\\\"
      case "\n": out += "\\n"
      case "\r": out += "\\r"
      case "\t": out += "\\t"
      default:
        if u.value < 0x20 { out += String(format: "\\u%04x", u.value) } else { out.unicodeScalars.append(u) }
      }
    }
    return out + "\""
  }

  /// Shortest round-trip form, as JavaScript would print it (integers without ".0").
  static func number(_ d: Double) -> String {
    if !d.isFinite { return "null" }
    if d == d.rounded(), abs(d) < 1e15 { return String(Int64(d)) }
    return "\(d)"
  }

  static func decode<T: Decodable>(_ type: T.Type, _ s: String) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(s.utf8))
  }

  static func object(_ s: String) -> Any? {
    try? JSONSerialization.jsonObject(with: Data(s.utf8), options: [.fragmentsAllowed])
  }
}

private struct AnyEncodable: Encodable {
  let value: Encodable
  init(_ v: Encodable) { value = v }
  func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
