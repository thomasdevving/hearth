import Foundation

#if DEBUG
/// Developer check for the Firebase AI Logic setup: launch a debug build with
/// `-HearthCloudCheck YES` and it sends one fixed test prompt (no user data) to Gemini through
/// `CloudModel`, then logs `HEARTH_CLOUD_CHECK ok …` or the error. It bypasses consent and the
/// ledger on purpose, so it exists only in debug builds.
enum CloudCheck {
  static var requested: Bool { UserDefaults.standard.bool(forKey: "HearthCloudCheck") }

  static func run() async {
    guard CloudModel.isConfigured else {
      print("HEARTH_CLOUD_CHECK skipped: cloud not configured (needs GoogleService-Info.plist and iOS 27)")
      return
    }
    let schema: [String: Any] = ["type": "object", "properties": ["reply": ["type": "string"]], "required": ["reply"]]
    let t0 = Date()
    do {
      let r = try await CloudModel.generate(
        instructions: "You are a connection test. Answer briefly.",
        prompt: "Say hello in at most five words. Return only JSON that matches the schema.",
        schema: schema, name: "CloudCheck")
      print("HEARTH_CLOUD_CHECK ok in \(Int(Date().timeIntervalSince(t0) * 1000)) ms, model \(CloudModel.modelName): \(r.text)")
    } catch {
      print("HEARTH_CLOUD_CHECK failed after \(Int(Date().timeIntervalSince(t0) * 1000)) ms: \(error)")
    }
  }
}
#endif
