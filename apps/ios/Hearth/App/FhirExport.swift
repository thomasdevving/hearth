import Foundation

/// FHIR R4 export of the plan and the questionnaires, for a GP's or clinician's system (web:
/// apps/web/src/export/fhir.ts; docs/DECISIONS.md, "Plan for the GP and FHIR export"). The same
/// resources, codes, fields and key order as the web, so the two files can be compared (see
/// HearthTests/ClinicianExportTests.swift and apps/web/test/fixtures/fhir-web.json). Built and
/// saved on the device; Hearth sends nothing. No identity: the Patient resource is empty and is
/// matched by the clinician on import. The people the user listed, the safety plan, the notes on
/// what helped and place names are not included. No model writes any of it.
///
/// Not shared engine code: fhir.ts lives in the web app, uses the web's labels and random ids,
/// so it is ported here line by line.
enum FhirExport {
  struct Input {
    var rules: [PlanRuleValue]
    var items: [PersonalItemValue]
    var actions: [PlanActionValue]
    var questionnaires: [QuestionnaireRecordValue]
    /// ISO timestamp, as JavaScript's `new Date().toISOString()` writes it.
    var now: String
  }

  // LOINC: PHQ-9 panel 44249-1, PHQ-2 panel 55757-9, totals 44261-6 / 55758-7, answer list LL358-3.
  struct Panel { let code, display, total, totalDisplay: String }
  static let panel: [String: Panel] = [
    "PHQ9": Panel(code: "44249-1", display: "PHQ-9 quick depression assessment panel", total: "44261-6", totalDisplay: "Patient Health Questionnaire 9 item (PHQ-9) total score [Reported]"),
    "PHQ2": Panel(code: "55757-9", display: "Patient Health Questionnaire 2 item (PHQ-2) [Reported]", total: "55758-7", totalDisplay: "Patient Health Questionnaire 2 item (PHQ-2) total score [Reported]"),
  ]
  static let itemLoinc = ["44250-9", "44255-8", "44259-0", "44254-1", "44251-7", "44258-2", "44252-5", "44253-3", "44260-8"]
  static let answerLoinc = ["LA6568-5", "LA6569-3", "LA6570-1", "LA6571-9"]

  private static func loinc(_ code: String, _ display: String) -> OrderedJSON {
    .object([("system", "http://loinc.org"), ("code", .string(code)), ("display", .string(display))])
  }

  /// The bundle, as ordered JSON. `uuid` is injectable for tests.
  static func bundle(_ inp: Input, uuid: () -> String = { UUID().uuidString.lowercased() }) -> OrderedJSON {
    let patientUrl = "urn:uuid:\(uuid())"
    var entries: [OrderedJSON] = [
      .object([("fullUrl", .string(patientUrl)), ("resource", .object([("resourceType", "Patient"), ("active", true)]))]),
    ]

    let signs = inp.rules.filter(\.active).map { r in
      let f = r.feature == "place_visits" ? "Visits to a named place" : Copy.feature(r.feature)
      return "\(f) \(Copy.direction(r.feature, r.direction)) (“\(r.quote)”)"
    }
    let questions = inp.items.filter(\.active).map { "\($0.question) (“\($0.quote)”)" }
    let notes: [OrderedJSON] = signs.map { .object([("text", .string("Early sign Hearth watches: \($0)"))]) }
      + questions.map { .object([("text", .string("Asked in check-ins: \($0)"))]) }
    let activity: [OrderedJSON] = inp.actions.filter(\.active).map { a in
      .object([("detail", .object([("status", "not-started"), ("description", .string("\(a.text) (in the person's words: “\(a.quote)”)"))]))])
    }
    entries.append(.object([
      ("fullUrl", .string("urn:uuid:\(uuid())")),
      ("resource", .object([
        ("resourceType", "CarePlan"),
        ("status", "active"),
        ("intent", "plan"),
        ("title", "Relapse prevention plan (signaleringsplan)"),
        ("description", "Written by the person in Hearth, in their own words. Early signs are watched against the person's own usual days."),
        ("subject", .object([("reference", .string(patientUrl))])),
        ("created", .string(inp.now)),
        ("note", .array(notes)),
        ("activity", .array(activity)),
      ])),
    ]))

    for q in inp.questionnaires.sorted(by: { $0.takenAt < $1.takenAt }) {
      guard let p = panel[q.instrument] else { continue }
      let def = Shared.questionnaire(q.instrument)
      let qrUrl = "urn:uuid:\(uuid())"
      let items: [OrderedJSON] = def.items.enumerated().map { i, it in
        let v = i < q.answers.count ? q.answers[i] : nil
        let opt = v.flatMap { v in def.options.first { $0.value == v } }
        var answer: [OrderedJSON] = []
        if let opt, let v, v >= 0, v < answerLoinc.count {
          answer = [.object([("valueCoding", .object([("system", "http://loinc.org"), ("code", .string(answerLoinc[v])), ("display", .string(opt.label))]))])]
        }
        return .object([
          ("linkId", .string(i < itemLoinc.count ? itemLoinc[i] : "\(i + 1)")),
          ("text", .string(it.text)),  // verbatim from shared/questionnaires (R1)
          ("answer", .array(answer)),
        ])
      }
      entries.append(.object([
        ("fullUrl", .string(qrUrl)),
        ("resource", .object([
          ("resourceType", "QuestionnaireResponse"),
          ("questionnaire", .string("http://loinc.org/q/\(p.code)")),
          ("status", "completed"),
          ("subject", .object([("reference", .string(patientUrl))])),
          ("authored", .string(q.takenAt)),
          ("item", .array(items)),
        ])),
      ]))
      var obs: [(String, OrderedJSON)] = [
        ("resourceType", "Observation"),
        ("status", "final"),
        ("category", .array([.object([("coding", .array([.object([("system", "http://terminology.hl7.org/CodeSystem/observation-category"), ("code", "survey"), ("display", "Survey")])]))])])),
        ("code", .object([("coding", .array([loinc(p.total, p.totalDisplay)])), ("text", .string("\(def.title) total score"))])),
        ("subject", .object([("reference", .string(patientUrl))])),
        ("effectiveDateTime", .string(q.takenAt)),
        ("valueInteger", .int(q.result.total)),
        ("derivedFrom", .array([.object([("reference", .string(qrUrl))])])),
      ]
      if let band = q.result.band, !band.isEmpty {
        obs.append(("interpretation", .array([.object([("text", .string(band.replacingOccurrences(of: "_", with: " ")))])])))
      }
      entries.append(.object([("fullUrl", .string("urn:uuid:\(uuid())")), ("resource", .object(obs))]))
    }

    return .object([("resourceType", "Bundle"), ("type", "collection"), ("timestamp", .string(inp.now)), ("entry", .array(entries))])
  }

  /// `new Date().toISOString()`: UTC with milliseconds.
  static func isoNow(_ date: Date = .now) -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    f.timeZone = TimeZone(identifier: "UTC")
    return f.string(from: date)
  }

  /// Everything from the store in key order, as the web's store lists it (inactive entries are
  /// filtered out above).
  @MainActor
  static func input(_ store: Store, now: String = isoNow()) -> Input {
    Input(
      rules: store.all(PlanRule.self, sort: [SortDescriptor(\.id)]).compactMap(\.value),
      items: store.all(PersonalItem.self, sort: [SortDescriptor(\.id)]).compactMap(\.value),
      actions: store.all(PlanAction.self, sort: [SortDescriptor(\.id)]).compactMap(\.value),
      questionnaires: store.all(QuestionnaireRecord.self).compactMap(\.value),
      now: now)
  }

  /// The file name the web uses: `hearth-plan-fhir-YYYY-MM-DD.json`.
  static func fileName(now: String) -> String { "hearth-plan-fhir-\(now.prefix(10)).json" }

  /// Writes the bundle as `JSON.stringify(bundle, null, 2)` would, to a local file to share.
  @MainActor
  static func writeFile(_ store: Store) throws -> URL {
    let inp = input(store)
    return try ExportFiles.write(Data(bundle(inp).pretty().utf8), name: fileName(now: inp.now))
  }
}

/// JSON with the keys in a fixed order, printed like `JSON.stringify(value, null, 2)`, so the
/// iOS file reads the same as the web's.
indirect enum OrderedJSON: Equatable, ExpressibleByStringLiteral, ExpressibleByBooleanLiteral {
  case string(String)
  case int(Int)
  case bool(Bool)
  case null
  case array([OrderedJSON])
  case object([(String, OrderedJSON)])

  init(stringLiteral value: String) { self = .string(value) }
  init(booleanLiteral value: Bool) { self = .bool(value) }

  static func == (a: OrderedJSON, b: OrderedJSON) -> Bool { a.pretty() == b.pretty() }

  subscript(key: String) -> OrderedJSON? {
    if case .object(let kv) = self { return kv.first { $0.0 == key }?.1 }
    return nil
  }

  func pretty(_ indent: String = "") -> String {
    let inner = indent + "  "
    switch self {
    case .string(let s): return JSONText.quote(s)
    case .int(let n): return String(n)
    case .bool(let b): return b ? "true" : "false"
    case .null: return "null"
    case .array(let a):
      if a.isEmpty { return "[]" }
      return "[\n" + a.map { inner + $0.pretty(inner) }.joined(separator: ",\n") + "\n" + indent + "]"
    case .object(let kv):
      if kv.isEmpty { return "{}" }
      return "{\n" + kv.map { inner + JSONText.quote($0.0) + ": " + $0.1.pretty(inner) }.joined(separator: ",\n") + "\n" + indent + "}"
    }
  }
}

/// Files made for sharing (the PDF pages and the FHIR file). They hold the user's own words
/// (S3), so they live in the app's own temporary folder with file protection, are replaced on
/// every export and removed with "Delete everything". Hearth itself sends none of them.
enum ExportFiles {
  static var dir: URL { FileManager.default.temporaryDirectory.appendingPathComponent("Export", isDirectory: true) }

  static func write(_ data: Data, name: String) throws -> URL {
    let fm = FileManager.default
    try fm.createDirectory(at: dir, withIntermediateDirectories: true)
    let url = dir.appendingPathComponent(name)
    try? fm.removeItem(at: url)
    try data.write(to: url, options: [.atomic, .completeFileProtection])
    return url
  }

  static func clear() { try? FileManager.default.removeItem(at: dir) }
}
