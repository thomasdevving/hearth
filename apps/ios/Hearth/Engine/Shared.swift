import Foundation

/// Read-only data from the bundled copy of /shared (copied at build time). Questionnaire items
/// and safety lines are shown exactly as written there (R1, R7).
enum Shared {
  static func url(_ path: String) -> URL? {
    Bundle.main.resourceURL?.appendingPathComponent("shared").appendingPathComponent(path)
  }

  static func text(_ path: String) -> String? {
    guard let u = url(path) else { return nil }
    return try? String(contentsOf: u, encoding: .utf8)
  }

  static func load<T: Decodable>(_ type: T.Type, _ path: String) -> T {
    guard let s = text(path), let v = try? JSONText.decode(T.self, s) else { fatalError("shared/\(path) missing or invalid") }
    return v
  }

  static let phq2 = load(QuestionnaireDef.self, "questionnaires/PHQ2.json")
  static let phq9 = load(QuestionnaireDef.self, "questionnaires/PHQ9.json")
  static let momentary = load(MomentaryDef.self, "questionnaires/momentary.json")
  static let crisisLines = load(CrisisLines.self, "safety/crisis_lines.json")

  static func questionnaire(_ id: String) -> QuestionnaireDef { id == "PHQ9" ? phq9 : phq2 }

  /// The engine config: bundled defaults, validated by the engine's `loadConfig` (docs/07 §5).
  /// Remote Config is not used in this build (no Firebase).
  static let configJSON: String = {
    let defaults = text("config/defaults.json") ?? "{}"
    return (try? Engine.shared.call("loadConfig", argsJSON: "[\(defaults)]")) ?? (try? Engine.shared.value("defaultConfig")) ?? "{}"
  }()
  static var config: RawJSON { RawJSON(configJSON) }

  struct Prompt { let id: String; let version: String; let text: String }

  /// shared/prompts/<id>.md with a `version:` first line (docs/05 §6).
  static func prompt(_ id: String) -> Prompt {
    let raw = text("prompts/\(id).md") ?? ""
    var version = "unknown"
    var body = raw
    if raw.hasPrefix("version:"), let nl = raw.firstIndex(of: "\n") {
      version = raw[raw.index(raw.startIndex, offsetBy: 8)..<nl].trimmingCharacters(in: .whitespaces)
      body = String(raw[raw.index(after: nl)...])
    }
    return Prompt(id: id, version: version, text: body.trimmingCharacters(in: .whitespacesAndNewlines))
  }

  static func schema(_ id: String) -> [String: Any] {
    guard let s = text("schemas/\(id).schema.json"), let o = JSONText.object(s) as? [String: Any] else { return [:] }
    return o
  }
}
