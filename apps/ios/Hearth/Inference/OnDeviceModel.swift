import Foundation
import FoundationModels

/// Apple's on-device model (`SystemLanguageModel.default`) through `LanguageModelSession`
/// (docs/PLATFORM_NOTES.md §2). Only the InferenceRouter calls this (R5).
///
/// Structured output: the task's JSON Schema from shared/schemas is turned into a
/// `DynamicGenerationSchema`, so one converter serves every task and the schema files stay
/// the single source. The engine still validates the JSON afterwards (R8).
enum OnDeviceModel {
  enum Availability: String { case available, notEligible = "device not eligible", notEnabled = "Apple Intelligence is off", notReady = "model not ready yet", unknown }

  static var availability: Availability {
    switch SystemLanguageModel.default.availability {
    case .available: return .available
    case .unavailable(.deviceNotEligible): return .notEligible
    case .unavailable(.appleIntelligenceNotEnabled): return .notEnabled
    case .unavailable(.modelNotReady): return .notReady
    default: return .unknown
    }
  }

  static var isAvailable: Bool { availability == .available }

  struct ModelError: Error, CustomStringConvertible { let description: String }

  /// One request. Returns the model's JSON text.
  static func generate(instructions: String, prompt: String, schema jsonSchema: [String: Any], name: String) async throws -> String {
    guard isAvailable else { throw ModelError(description: "on-device model unavailable") }
    let root = dynamicSchema(jsonSchema, name: name)
    let schema = try GenerationSchema(root: root, dependencies: [])
    let session = LanguageModelSession(model: .default, instructions: instructions)
    let options = GenerationOptions(temperature: 0.2, maximumResponseTokens: 600)
    let response = try await session.respond(to: prompt, schema: schema, includeSchemaInPrompt: true, options: options)
    return response.content.jsonString
  }

  /// JSON Schema (the subset used in shared/schemas: object, array, string with enum,
  /// integer with minimum/maximum, number, boolean) → DynamicGenerationSchema.
  static func dynamicSchema(_ s: [String: Any], name: String) -> DynamicGenerationSchema {
    let description = s["description"] as? String
    switch s["type"] as? String {
    case "object":
      let props = s["properties"] as? [String: Any] ?? [:]
      let required = s["required"] as? [String] ?? []
      let order = required + props.keys.filter { !required.contains($0) }.sorted()
      let properties: [DynamicGenerationSchema.Property] = order.compactMap { key in
        guard let p = props[key] as? [String: Any] else { return nil }
        return DynamicGenerationSchema.Property(
          name: key, description: p["description"] as? String,
          schema: dynamicSchema(p, name: "\(name)_\(key)"), isOptional: !required.contains(key))
      }
      return DynamicGenerationSchema(name: name, description: description ?? (s["title"] as? String), properties: properties)
    case "array":
      let items = dynamicSchema(s["items"] as? [String: Any] ?? ["type": "string"], name: "\(name)_item")
      return DynamicGenerationSchema(arrayOf: items, minimumElements: s["minItems"] as? Int, maximumElements: s["maxItems"] as? Int)
    case "string":
      if let e = s["enum"] as? [String] { return DynamicGenerationSchema(name: name, description: description, anyOf: e) }
      return DynamicGenerationSchema(type: String.self)
    case "integer":
      if let lo = s["minimum"] as? Int, let hi = s["maximum"] as? Int {
        return DynamicGenerationSchema(type: Int.self, guides: [.range(lo...hi)])
      }
      return DynamicGenerationSchema(type: Int.self)
    case "number":
      return DynamicGenerationSchema(type: Double.self)
    case "boolean":
      return DynamicGenerationSchema(type: Bool.self)
    default:
      return DynamicGenerationSchema(type: String.self)
    }
  }
}

/// The cloud model. On iOS it is Gemini through `ai.geminiLanguageModel(name:)` in Firebase
/// Apple SDK 13, which needs iOS 27 and a GoogleService-Info.plist. Neither is present in this
/// build, so it is never reachable: every cloud route falls back exactly as offline.
enum CloudModel {
  static var isConfigured: Bool { Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist") != nil && sdkLinked }
  /// The Firebase SDK is not linked yet (docs/DECISIONS.md, M8 iOS).
  static let sdkLinked = false

  static func generate(instructions: String, prompt: String, schema: [String: Any]) async throws -> (text: String, payload: String) {
    throw OnDeviceModel.ModelError(description: "cloud model not available in this build")
  }
}
