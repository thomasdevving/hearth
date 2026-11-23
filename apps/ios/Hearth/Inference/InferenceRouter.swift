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
    /// S1 tasks reach the cloud only with consent AND after the user has seen the exact payload
    /// (`cloudPayload`) and approved it: the router compares the two before every cloud call.
    var approvedCloudPayload: String? = nil
    /// false: never the cloud for this call (the user chose "on this device instead").
    var allowCloud = true
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

  /// Where one call would run: the routing decision and the models to try, in order. Shared
  /// by `run` and `cloudPayload`, so the preview shows exactly what `run` would send.
  private struct Routing {
    let def: TaskDef
    let ledgerTask: String
    let promptId: String
    let schemaId: String
    let prompt: Shared.Prompt
    let dataClass: String
    let stub: Bool
    let decisionJSON: String
    let decision: RouteDecision
    var plan: [String]
  }

  private func routing(_ task: String, options: Options) -> Routing? {
    let ledgerTask = task.hasPrefix("Q") ? "Q" : task
    guard let def = Self.tasks[ledgerTask] else { return nil }
    let promptId = task == "Q" ? "Q_classify" : task
    let schemaId = task == "Q" ? "Q_classify" : task
    let prompt = Shared.prompt(promptId)
    // The question in "ask your data" is raw free text: on-device only (R3, DECISIONS M10).
    let dataClass = (task == "Q" || task == "Q_classify") ? "S3" : def.dataClass
    let settings = store.settings
    #if DEBUG
    let stub = DemoData.stubs(task)
    let online = CloudModel.isConfigured || DemoData.cloudReachable
    #else
    let stub = false
    let online = CloudModel.isConfigured
    #endif
    let onDeviceAvailable = (settings.onDeviceEnabled && OnDeviceModel.isAvailable) || stub
    let req: [String: Any] = [
      "dataClass": dataClass, "cloudConsent": settings.cloudConsent, "onDeviceAvailable": onDeviceAvailable,
      "online": online, "prefersCloud": def.prefersCloud, "hasLiteVariant": def.hasLiteVariant,
    ]
    let decisionJSON = (try? Engine.shared.call("route", req)) ?? #"{"run":"fallback","reason":"no_model"}"#
    let decision = (try? JSONText.decode(RouteDecision.self, decisionJSON)) ?? RouteDecision(run: "fallback", mode: nil, variant: nil, reason: "no_model")
    // Order of models to try for this mode.
    var plan: [String] = {
      guard decision.run == "model" else { return [] }
      switch decision.mode ?? "ONLY_ON_DEVICE" {
      case "ONLY_ON_DEVICE": return ["on_device"]
      case "PREFER_ON_DEVICE": return ["on_device", "cloud"]
      case "PREFER_IN_CLOUD": return ["cloud", "on_device"]
      default: return ["cloud"]
      }
    }()
    if dataClass == "S3" { plan.removeAll { $0 == "cloud" } }  // R3, whatever routing said
    if !onDeviceAvailable { plan.removeAll { $0 == "on_device" } }
    if !online || !settings.cloudConsent || !options.allowCloud { plan.removeAll { $0 == "cloud" } }  // R4
    return Routing(def: def, ledgerTask: ledgerTask, promptId: promptId, schemaId: schemaId, prompt: prompt, dataClass: dataClass,
                   stub: stub, decisionJSON: decisionJSON, decision: decision, plan: plan)
  }

  /// The exact text a cloud call for this task would send (instructions and message), or nil
  /// when this call would not reach the cloud (no consent, not set up, S3, or not allowed).
  /// The screen shows it and passes it back as `approvedCloudPayload` once the user agrees.
  func cloudPayload(_ task: String, input: [String: Any], options: Options = Options()) -> String? {
    guard let r = routing(task, options: options), r.plan.contains("cloud") else { return nil }
    let variant = r.decision.variant ?? "full"
    return Self.cloudText(prompt: r.prompt.text, message: Self.userMessage(task, options.variantInput?(variant) ?? input))
  }

  /// Exactly what `CloudModel.generate` hands to the cloud.
  static func cloudText(prompt: String, message: String) -> String { "\(prompt)\n\n\(message)" }

  private func runOne(_ task: String, input: [String: Any], options: Options) async -> Result {
    guard var r = routing(task, options: options) else {
      return Result(ok: false, json: nil, ranOn: "none", reason: "error", ledgerId: "")
    }
    let (def, ledgerTask, promptId, schemaId, prompt, dataClass, stub, decisionJSON, decision) =
      (r.def, r.ledgerTask, r.promptId, r.schemaId, r.prompt, r.dataClass, r.stub, r.decisionJSON, r.decision)
    let base = LedgerBase(task: ledgerTask, promptVersion: "\(promptId)@\(prompt.version)", dataClass: dataClass, decisionJSON: decisionJSON)

    if decision.run == "fallback" {
      let id = ledger(base, ranOn: "none", outcome: "fallback", attempts: 0, latencyMs: nil)
      return Result(ok: false, json: nil, ranOn: "none", reason: decision.reason ?? "no_model", ledgerId: id)
    }
    // S1: the cloud only with the exact payload the user approved (R4).
    if dataClass == "S1", r.plan.contains("cloud") {
      let variant = decision.variant ?? "full"
      let payload = Self.cloudText(prompt: prompt.text, message: Self.userMessage(task, options.variantInput?(variant) ?? input))
      if options.approvedCloudPayload != payload { r.plan.removeAll { $0 == "cloud" } }
    }
    let plan = r.plan
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
