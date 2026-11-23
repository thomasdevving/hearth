import Foundation

/// The InferenceRouter for iOS (docs/02 §5). Feature code reaches a model only through
/// `run` (R5). The routing table is the engine's `route` (packages/engine/src/routing.ts) and
/// every output passes the engine's `verifyTask` (schema, quote check, number check, banned
/// words) before use (R8). Every attempt is written to the privacy ledger (R4).
///
/// S3 tasks run on the device only; without the Apple model they return `no_model` and the
/// caller uses the non-LLM fallback. They never fall back to the cloud (R3), and a second
/// check below refuses any cloud call for S3 even if routing said otherwise.
@MainActor
final class InferenceRouter {
  struct TaskDef: Decodable { let id: String; let dataClass: String; let prefersCloud: Bool; let hasLiteVariant: Bool; let schema: String; let prompt: String }

  struct Result {
    let ok: Bool
    let json: String?          // the verified value, as JSON
    let ranOn: String          // on_device | cloud | none
    let reason: String?        // no_model | no_consent | offline | invalid_output | error
    let ledgerId: String
    func decode<T: Decodable>(_ t: T.Type) -> T? { json.flatMap { try? JSONText.decode(T.self, $0) } }
  }

  struct Options {
    var sourceText: String? = nil
    var verify: [String: Any] = [:]
    /// Task D: the input depends on the variant (lite on-device, full in the cloud).
    var variantInput: ((String) -> [String: Any])? = nil
  }

  private let store: Store
  private static let tasks: [String: TaskDef] = (try? JSONText.decode([String: TaskDef].self, Engine.shared.value("TASKS"))) ?? [:]
  /// Tasks whose input is the user's own text: it goes between delimiters, never as instructions.
  private static let textTasks: Set<String> = ["G", "G2", "H", "I", "B", "P", "Q_classify", "R", "T"]
  private var busy = false

  init(store: Store) { self.store = store }

  func run(_ task: String, input: [String: Any], options: Options = Options()) async -> Result {
    // One call at a time, so each ledger entry belongs to exactly one request.
    while busy { try? await Task.sleep(for: .milliseconds(50)) }
    busy = true
    defer { busy = false }
    return await runOne(task, input: input, options: options)
  }

  private func runOne(_ task: String, input: [String: Any], options: Options) async -> Result {
    let ledgerTask = task.hasPrefix("Q") ? "Q" : task
    guard let def = Self.tasks[ledgerTask] else {
      return Result(ok: false, json: nil, ranOn: "none", reason: "error", ledgerId: "")
    }
    let promptId = task == "Q" ? "Q_classify" : task
    let schemaId = task == "Q" ? "Q_classify" : task
    let prompt = Shared.prompt(promptId)
    // The question in "ask your data" is raw free text: on-device only (R3, DECISIONS M10).
    let dataClass = (task == "Q" || task == "Q_classify") ? "S3" : def.dataClass
    let settings = store.settings
    #if DEBUG
    let stub = DemoData.stubs(task)
    #else
    let stub = false
    #endif
    let onDeviceAvailable = (settings.onDeviceEnabled && OnDeviceModel.isAvailable) || stub
    let online = CloudModel.isConfigured
    let req: [String: Any] = [
      "dataClass": dataClass, "cloudConsent": settings.cloudConsent, "onDeviceAvailable": onDeviceAvailable,
      "online": online, "prefersCloud": def.prefersCloud, "hasLiteVariant": def.hasLiteVariant,
    ]
    let decisionJSON = (try? Engine.shared.call("route", req)) ?? #"{"run":"fallback","reason":"no_model"}"#
    let decision = (try? JSONText.decode(RouteDecision.self, decisionJSON)) ?? RouteDecision(run: "fallback", mode: nil, variant: nil, reason: "no_model")
    let base = LedgerBase(task: ledgerTask, promptVersion: "\(promptId)@\(prompt.version)", dataClass: dataClass, decisionJSON: decisionJSON)

    if decision.run == "fallback" {
      let id = ledger(base, ranOn: "none", outcome: "fallback", attempts: 0, latencyMs: nil)
      return Result(ok: false, json: nil, ranOn: "none", reason: decision.reason ?? "no_model", ledgerId: id)
    }
    let mode = decision.mode ?? "ONLY_ON_DEVICE"
    // Order of models to try for this mode.
    var plan: [String] = {
      switch mode {
      case "ONLY_ON_DEVICE": return ["on_device"]
      case "PREFER_ON_DEVICE": return ["on_device", "cloud"]
      case "PREFER_IN_CLOUD": return ["cloud", "on_device"]
      default: return ["cloud"]
      }
    }()
    if dataClass == "S3" { plan.removeAll { $0 == "cloud" } }  // R3, whatever routing said
    if !onDeviceAvailable { plan.removeAll { $0 == "on_device" } }
    if !online || !settings.cloudConsent { plan.removeAll { $0 == "cloud" } }
    guard !plan.isEmpty else {
      let id = ledger(base, ranOn: "none", outcome: "fallback", attempts: 0, latencyMs: nil)
      return Result(ok: false, json: nil, ranOn: "none", reason: "no_model", ledgerId: id)
    }

    let schema = Shared.schema(schemaId)
    var lastId = ""
    for attempt in 1...2 {
      for target in plan {
        let variant = (target == "on_device" && def.hasLiteVariant) ? "lite" : (decision.variant ?? "full")
        let finalInput = options.variantInput?(variant) ?? input
        let message = Self.userMessage(task, finalInput)
        let liteNote = def.hasLiteVariant && target == "on_device" ? "\n\nThis runs on the device: always write the lite variant (at most 60 words), whatever the input says." : ""
        let t0 = Date()
        var text: String?
        var payload: String?
        do {
          if target == "on_device" && stub {
            #if DEBUG
            text = DemoData.stub(task, finalInput)
            #endif
          } else if target == "on_device" {
            text = try await OnDeviceModel.generate(instructions: prompt.text + liteNote, prompt: message, schema: schema, name: "Task\(schemaId)")
          } else {
            let r = try await CloudModel.generate(instructions: prompt.text, prompt: message, schema: schema, name: "Task\(schemaId)")
            text = r.text; payload = r.payload
          }
        } catch {
          let ms = Int(Date().timeIntervalSince(t0) * 1000)
          lastId = ledger(base, ranOn: target, outcome: "error", attempts: attempt, latencyMs: ms, payload: payload)
          continue
        }
        let ms = Int(Date().timeIntervalSince(t0) * 1000)
        var ctx = options.verify
        if let s = options.sourceText { ctx["sourceText"] = s }
        if ctx["facts"] == nil { ctx["facts"] = finalInput }
        ctx["variant"] = variant
        if ctx["cfg"] == nil { ctx["cfg"] = Shared.config }
        if ctx["today"] == nil { ctx["today"] = Clock.today }
        let raw = RawJSON((try? Engine.shared.call("parseJsonLoose", text ?? "")) ?? "null")
        let verdict = (try? Engine.shared.call("verifyTask", task, raw, ctx)).flatMap { JSONText.object($0) as? [String: Any] }
        if verdict?["ok"] as? Bool == true {
          lastId = ledger(base, ranOn: target, outcome: "ok", attempts: attempt, latencyMs: ms, payload: payload)
          return Result(ok: true, json: JSONText.encode(verdict?["value"] ?? NSNull()), ranOn: target, reason: nil, ledgerId: lastId)
        }
        lastId = ledger(base, ranOn: target, outcome: "invalid_output", attempts: attempt, latencyMs: ms, payload: payload)
      }
    }
    return Result(ok: false, json: nil, ranOn: "none", reason: "invalid_output", ledgerId: lastId)
  }

  static func userMessage(_ task: String, _ input: [String: Any]) -> String {
    if textTasks.contains(task), let text = input["text"] as? String {
      var rest = input
      rest.removeValue(forKey: "text")
      let ctx = rest.isEmpty ? "" : "Input:\n\(JSONText.encode(rest))\n\n"
      let clean = text.replacingOccurrences(of: "</?user_text>", with: "", options: [.regularExpression, .caseInsensitive])
      return "\(ctx)<user_text>\n\(clean)\n</user_text>\n\nReturn only JSON that matches the schema."
    }
    return "Input:\n\(JSONText.encode(input))\n\nReturn only JSON that matches the schema."
  }

  // Ledger (docs/07 §2.9) -------------------------------------------------------------------

  private struct LedgerBase { let task: String; let promptVersion: String; let dataClass: String; let decisionJSON: String }

  @discardableResult
  private func ledger(_ b: LedgerBase, ranOn: String, outcome: String, attempts: Int, latencyMs: Int?, payload: String? = nil) -> String {
    let id = newId("ledger")
    let at = Clock.nowStamp
    let cloud = ranOn == "cloud"
    let entry: [String: Any] = [
      "id": id, "at": at, "task": b.task, "promptVersion": b.promptVersion, "dataClass": b.dataClass,
      "decision": RawJSON(b.decisionJSON), "ranOn": ranOn, "outcome": outcome, "attempts": attempts,
      "latencyMs": latencyMs.map { $0 as Any } ?? NSNull(),
      "bytesSent": cloud ? (payload?.utf8.count ?? 0) : 0,
      "payloadSent": cloud ? (payload.map { $0 as Any } ?? NSNull()) : NSNull(),
    ]
    store.context.insert(LedgerEntry(id: id, at: at, json: JSONText.encode(entry)))
    store.save()
    return id
  }
}
