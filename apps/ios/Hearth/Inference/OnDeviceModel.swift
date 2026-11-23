import FirebaseAILogic
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

/// The cloud model: Gemini through Firebase AI Logic. With Firebase Apple SDK 13 the Gemini
/// model plugs into Apple's own `LanguageModelSession` (`ai.geminiLanguageModel(name:)`), so the
/// cloud uses the same session API, the same `DynamicGenerationSchema` and the same engine
/// checks as the on-device model. There is no built-in fallback in SDK 13: the InferenceRouter
/// chooses the order (docs/PLATFORM_NOTES.md §2). Needs iOS 27, Xcode 27 (Swift 6.4) and a
/// `GoogleService-Info.plist`; without them every cloud route falls back exactly as offline.
enum CloudModel {
  /// The same default as the web app (`GEMINI_MODEL`); `HearthGeminiModel` in Info.plist overrides it.
  static let modelName = (Bundle.main.object(forInfoDictionaryKey: "HearthGeminiModel") as? String) ?? "gemini-3.5-flash"

  static var isConfigured: Bool {
    #if compiler(>=6.4)
    if #available(iOS 27.0, *) { return FirebaseSetup.started }
    #endif
    return false
  }

  /// One request. Returns the model's JSON text and the content handed to the cloud, for the
  /// privacy ledger (R4). Only S1 and S2 tasks get here; the router refuses S3 (R3).
  static func generate(instructions: String, prompt: String, schema jsonSchema: [String: Any], name: String) async throws -> (text: String, payload: String) {
    #if compiler(>=6.4)
    if #available(iOS 27.0, *), FirebaseSetup.started {
      let ai = FirebaseAI.firebaseAI(backend: .googleAI(), useLimitedUseAppCheckTokens: true)
      let model = ai.geminiLanguageModel(name: modelName)
      let session = LanguageModelSession(model: model, instructions: instructions)
      let schema = try GenerationSchema(root: OnDeviceModel.dynamicSchema(jsonSchema, name: name), dependencies: [])
      let payload = "\(instructions)\n\n\(prompt)"
      let response = try await session.respond(to: prompt, schema: schema, includeSchemaInPrompt: false, options: GenerationOptions(temperature: 0.2))
      return (response.content.jsonString, payload)
    }
    #endif
    throw OnDeviceModel.ModelError(description: "cloud model not available in this build")
  }
}
