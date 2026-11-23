import PDFKit
import SwiftData
import SwiftUI
import XCTest
@testable import Hearth

/// "For your GP or clinician": the FHIR file (the same as the web's, compared with the web's own
/// output for a shared fixture), the content of the one-page plan and of the clinician summary,
/// and the PDF (A4, one page). No model is involved in any of it.
@MainActor
final class ClinicianExportTests: XCTestCase {
  private var container: ModelContainer!
  private var app: AppModel!

  override func setUp() async throws {
    container = try Store.makeContainer(inMemory: true)
    app = AppModel(store: Store(context: container.mainContext))
    app.settings.onDeviceEnabled = false
  }

  // Fixtures ---------------------------------------------------------------------------------

  /// apps/web/test/fixtures, copied into the test bundle by scripts/copy-resources.sh.
  private func parity(_ name: String) throws -> String {
    let url = try XCTUnwrap(Bundle(for: Self.self).resourceURL?.appendingPathComponent("parity/\(name)"))
    return try String(contentsOf: url, encoding: .utf8)
  }

  private struct FixtureInput: Decodable {
    var now: String
    var rules: [PlanRuleValue]
    var items: [PersonalItemValue]
    var actions: [PlanActionValue]
    var questionnaires: [QuestionnaireRecordValue]
  }

  private func fixtureInput() throws -> FhirExport.Input {
    let f = try JSONText.decode(FixtureInput.self, parity("fhir-input.json"))
    return .init(rules: f.rules, items: f.items, actions: f.actions, questionnaires: f.questionnaires, now: f.now)
  }

  /// urn:uuid values numbered in order of appearance, as the web test writes them.
  private func numberUuids(_ s: String) -> String {
    var seen: [String: String] = [:]
    var out = s
    let re = try! NSRegularExpression(pattern: "urn:uuid:[0-9a-zA-Z-]+")
    for m in re.matches(in: s, range: NSRange(s.startIndex..., in: s)) {
      let u = String(s[Range(m.range, in: s)!])
      if seen[u] == nil { seen[u] = "urn:uuid:\(seen.count + 1)" }
    }
    for (u, n) in seen.sorted(by: { $0.key.count > $1.key.count }) { out = out.replacingOccurrences(of: u, with: n) }
    return out
  }

  private func bundle(_ inp: FhirExport.Input) -> [String: Any] {
    JSONText.object(FhirExport.bundle(inp).pretty()) as? [String: Any] ?? [:]
  }

  private func resources(_ b: [String: Any], _ type: String) -> [[String: Any]] {
    ((b["entry"] as? [[String: Any]]) ?? []).compactMap { $0["resource"] as? [String: Any] }.filter { $0["resourceType"] as? String == type }
  }

  /// Every key path in a JSON value ("entry[].resource.item[].linkId").
  private func keyPaths(_ v: Any, _ prefix: String = "") -> Set<String> {
    if let o = v as? [String: Any] {
      return o.reduce(into: Set<String>()) { acc, kv in
        let p = prefix.isEmpty ? kv.key : "\(prefix).\(kv.key)"
        acc.insert(p)
        acc.formUnion(keyPaths(kv.value, p))
      }
    }
    if let a = v as? [Any] { return a.reduce(into: Set<String>()) { $0.formUnion(keyPaths($1, prefix + "[]")) } }
    return []
  }

  // FHIR -------------------------------------------------------------------------------------

  func testFhirIsTheSameTextAsTheWebOutput() throws {
    let web = try parity("fhir-web.json")
    let ios = numberUuids(FhirExport.bundle(try fixtureInput()).pretty()) + "\n"
    XCTAssertEqual(ios, web)
  }

  func testFhirHasTheSameKeysAsTheWeb() throws {
    let web = try XCTUnwrap(JSONText.object(try parity("fhir-web.json")))
    let ios = bundle(try fixtureInput())
    XCTAssertEqual(keyPaths(ios), keyPaths(web))
    XCTAssertTrue(keyPaths(ios).contains("entry[].resource.interpretation[].text"))
  }

  func testFhirStructureAndCodes() throws {
    let b = bundle(try fixtureInput())
    XCTAssertEqual(b["resourceType"] as? String, "Bundle")
    XCTAssertEqual(b["type"] as? String, "collection")
    XCTAssertEqual(b["timestamp"] as? String, "2026-11-22T10:00:00.000Z")
    let entries = try XCTUnwrap(b["entry"] as? [[String: Any]])
    for e in entries { XCTAssertTrue((e["fullUrl"] as? String)?.hasPrefix("urn:uuid:") == true) }
    // Patient without identity.
    let patients = resources(b, "Patient")
    XCTAssertEqual(patients.count, 1)
    XCTAssertEqual(Set(patients[0].keys), ["resourceType", "active"])
    let patientUrl = try XCTUnwrap(entries[0]["fullUrl"] as? String)

    // CarePlan: active signs and questions as notes, active actions as activities.
    let plan = try XCTUnwrap(resources(b, "CarePlan").first)
    XCTAssertEqual(plan["status"] as? String, "active")
    XCTAssertEqual(plan["intent"] as? String, "plan")
    XCTAssertEqual((plan["subject"] as? [String: Any])?["reference"] as? String, patientUrl)
    XCTAssertEqual((plan["note"] as? [[String: Any]])?.compactMap { $0["text"] as? String }, [
      "Early sign Hearth watches: Middle of your night gets later (“going to bed later”)",
      "Early sign Hearth watches: Steps go down (“I hardly walk”)",
      "Early sign Hearth watches: Visits to a named place go down (“I stop going to the climbing gym”)",
      "Asked in check-ins: Did you reply to messages today? (“stop replying to messages”)",
    ])
    let acts = try XCTUnwrap(plan["activity"] as? [[String: Any]])
    XCTAssertEqual(acts.count, 2)
    XCTAssertEqual((acts[0]["detail"] as? [String: Any])?["status"] as? String, "not-started")

    // Questionnaires oldest first, each a QuestionnaireResponse and an Observation.
    let qrs = resources(b, "QuestionnaireResponse")
    XCTAssertEqual(qrs.map { $0["questionnaire"] as? String }, ["http://loinc.org/q/44249-1", "http://loinc.org/q/55757-9", "http://loinc.org/q/44249-1"])
    XCTAssertEqual(qrs.map { $0["authored"] as? String }, ["2026-10-05T19:00:00+02:00", "2026-11-18T08:30:00+01:00", "2026-11-20T21:15:00+01:00"])
    let items = try XCTUnwrap(qrs[0]["item"] as? [[String: Any]])
    XCTAssertEqual(items.compactMap { $0["linkId"] as? String }, FhirExport.itemLoinc)
    // R1: the item texts verbatim from shared/questionnaires.
    XCTAssertEqual(items.compactMap { $0["text"] as? String }, Shared.phq9.items.map(\.text))
    let coding = ((items[2]["answer"] as? [[String: Any]])?.first?["valueCoding"] as? [String: Any])
    XCTAssertEqual(coding?["code"] as? String, "LA6570-1")
    XCTAssertEqual(coding?["display"] as? String, "More than half the days")
    XCTAssertEqual(coding?["system"] as? String, "http://loinc.org")

    let obs = resources(b, "Observation")
    XCTAssertEqual(obs.map { (($0["code"] as? [String: Any])?["coding"] as? [[String: Any]])?.first?["code"] as? String }, ["44261-6", "55758-7", "44261-6"])
    XCTAssertEqual(obs.map { $0["valueInteger"] as? Int }, [5, 3, 13])
    XCTAssertEqual(((obs[2]["interpretation"] as? [[String: Any]])?.first?["text"] as? String), "moderate")
    XCTAssertNil(obs[1]["interpretation"], "a PHQ-2 has no range")
    let qrUrls = entries.filter { ($0["resource"] as? [String: Any])?["resourceType"] as? String == "QuestionnaireResponse" }.compactMap { $0["fullUrl"] as? String }
    XCTAssertEqual(obs.compactMap { ($0["derivedFrom"] as? [[String: Any]])?.first?["reference"] as? String }, qrUrls)
    XCTAssertEqual(((obs[0]["category"] as? [[String: Any]])?.first?["coding"] as? [[String: Any]])?.first?["code"] as? String, "survey")
  }

  /// What the web leaves out stays out: people, the safety plan, notes on what helped, diary
  /// text, place names and smaller steps.
  func testFhirFromTheStoreLeavesOutWhatTheWebLeavesOut() throws {
    let s = app.store
    let rule: [String: Any] = ["id": "r1", "feature": "place_visits", "direction": "lower", "placeId": "p1", "quote": "I skip training", "active": true]
    s.context.insert(PlanRule(id: "r1", json: JSONText.encode(rule)))
    let action: [String: Any] = ["id": "a1", "text": "Call my sister", "quote": "talking helps", "active": true, "smaller": "Send her a text"]
    s.context.insert(PlanAction(id: "a1", json: JSONText.encode(action)))
    s.context.insert(Person(id: "p", order: 0, name: "Maya", phone: "+31 6 5555 0101", goodFor: "walks", message: "Fancy a walk?"))
    s.context.insert(SafetyPlan(warningSigns: "I stay in bed", helps: "Go to Anna's", whoToCall: "Anna"))
    s.context.insert(HelpedNote(id: "n", signQuote: "I skip training", text: "Texting Maya helped", audio: nil, message: "Walk?", contactName: "Maya", createdAt: "2026-11-01"))
    s.context.insert(DiaryEntry(id: "d", date: "2026-11-01", text: "a private diary line", markersJSON: nil, markersSource: "none", languageJSON: nil))
    let state: [String: Any] = ["state": "MONITOR", "places": [["id": "p1", "lat": 52.1, "lon": 4.3, "minutes": 90, "label": "bouldergym"]], "homePlaceId": NSNull(), "lastProcessedDate": NSNull()]
    s.putEngineState(JSONText.encode(state))
    s.save()

    let url = try FhirExport.writeFile(s)
    XCTAssertTrue(url.lastPathComponent.hasPrefix("hearth-plan-fhir-") && url.pathExtension == "json")
    let text = try String(contentsOf: url, encoding: .utf8)
    XCTAssertNotNil(JSONText.object(text), "the file is valid JSON")
    for leftOut in ["Maya", "5555", "Anna", "stay in bed", "Texting", "diary", "bouldergym", "52.1", "Send her a text"] {
      XCTAssertFalse(text.contains(leftOut), leftOut)
    }
    XCTAssertTrue(text.contains("Visits to a named place go down (“I skip training”)"))
    XCTAssertTrue(text.contains("Call my sister (in the person's words: “talking helps”)"))
    ExportFiles.clear()
    XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
  }

  func testTimestampLikeJavaScript() {
    XCTAssertEqual(FhirExport.isoNow(Date(timeIntervalSince1970: 1_795_341_600.25)), "2026-11-22T10:00:00.250Z")
    XCTAssertEqual(FhirExport.fileName(now: "2026-11-22T10:00:00.250Z"), "hearth-plan-fhir-2026-11-22.json")
  }

  // Page content -----------------------------------------------------------------------------

  private func day(_ date: String, _ state: EngineStateName, _ phrases: [String] = []) -> (date: String, state: EngineStateName, phrases: [String]) {
    (date, state, phrases)
  }

  private func q(_ inst: String, _ answers: [Int], _ takenAt: String, remission: Int? = nil) throws -> QuestionnaireRecordValue {
    let ref = JSONText.encode(["remissionScore": remission.map { $0 as Any } ?? NSNull()])
    let result = try Engine.shared.call("scoreQuestionnaire", inst, answers, RawJSON(ref), Shared.config)
    return try JSONText.decode(QuestionnaireRecordValue.self, JSONText.encode(["id": "q_\(takenAt)", "instrument": inst, "takenAt": takenAt, "answers": answers, "result": RawJSON(result)]))
  }

  func testChangeSummaryAsOnTheWeb() {
    let s = GPSummary.change([
      day("2026-09-27", .MONITOR), day("2026-09-29", .ELEVATED), day("2026-09-28", .ELEVATED),
      day("2026-09-30", .CONFIRMED, ["later sleep", "higher resting heart rate"]),
    ])
    XCTAssertEqual(s.since, "2026-09-28")
    XCTAssertEqual(s.days, 3)
    XCTAssertEqual(s.changes, ["later sleep", "higher resting heart rate"])
    XCTAssertEqual(s.lastDate, "2026-09-30")
    let usual = GPSummary.change([day("2026-09-28", .ELEVATED), day("2026-09-29", .MONITOR)])
    XCTAssertNil(usual.since)
    XCTAssertEqual(usual.state, .MONITOR)
    XCTAssertNil(GPSummary.change([(date: String, state: EngineStateName, phrases: [String])]()).state)
  }

  func testQuestionnaireNotesAsOnTheWeb() throws {
    let cut = GPSummary.phq2Cutoff
    XCTAssertEqual(cut, 3, "from shared/config/defaults.json")
    XCTAssertEqual(GPSummary.note(try q("PHQ2", [2, 2], "2026-10-05T09:00:00+02:00"), phq2Cutoff: cut), "At or above the usual cut-off of 3; PHQ-9 offered")
    XCTAssertEqual(GPSummary.note(try q("PHQ2", [1, 0], "2026-10-05T09:00:00+02:00"), phq2Cutoff: cut), "Below the usual cut-off of 3")
    XCTAssertEqual(GPSummary.note(try q("PHQ9", [0, 0, 1, 1, 1, 0, 0, 0, 0], "2026-10-05T09:00:00+02:00"), phq2Cutoff: cut), "Range: minimal")
    XCTAssertTrue(GPSummary.note(try q("PHQ9", [2, 2, 2, 2, 2, 2, 2, 2, 0], "2026-10-05T09:00:00+02:00"), phq2Cutoff: cut).hasPrefix("Range: moderately severe"))
    XCTAssertEqual(GPSummary.firstPerson("Middle of your night"), "Middle of my night")
    XCTAssertEqual(GPSummary.firstPerson("Your days"), "My days")
    XCTAssertEqual(GPSummary.firstPerson("Time at home"), "Time at home")
    XCTAssertEqual(GPSummary.docDate("2026-10-05T19:00:00+02:00"), "5 Oct 2026")
  }

  private func inputs(records: [DayRecordValue] = [], qs: [QuestionnaireRecordValue] = []) -> PlanPageContent.Inputs {
    .init(
      today: "2026-11-23",
      records: records,
      rules: [
        .init(id: "r1", feature: "rest_midpoint", direction: "later", placeId: nil, quote: "I go to bed later and later", active: true),
        .init(id: "r2", feature: "place_visits", direction: "lower", placeId: "p1", quote: "I stop going to the gym", active: true),
        .init(id: "r3", feature: "steps", direction: "lower", placeId: nil, quote: "an old sign", active: false),
      ],
      items: [.init(id: "i1", question: "Did you reply to messages today?", quote: "stop replying to messages", active: true)],
      actions: [
        .init(id: "a1", text: "Call my sister", quote: "x", active: true),
        .init(id: "a2", text: "Cook a proper meal", quote: "y", active: true, smaller: "Make toast"),
      ],
      questionnaires: qs,
      people: [("Maya", "a walk and a talk"), ("", "")],
      safety: ("I stop eating", "Go to my sister's place", "My sister Anna"),
      places: [Place(id: "p1", lat: 0, lon: 0, minutes: 60, label: "gym")],
      line: .init(name: "113 Zelfmoordpreventie", phone: "113", alt_phone: nil, url: "https://www.113.nl", emergency: "112"),
      phq2Cutoff: 3,
      simulated: false)
  }

  func testPlanPageContentInTheWebOrderAndWords() throws {
    let qs = try [
      q("PHQ9", [1, 0, 1, 0, 1, 0, 0, 0, 0], "2026-09-01T19:00:00+02:00"),
      q("PHQ2", [1, 0], "2026-09-20T19:00:00+02:00"),
      q("PHQ2", [2, 1], "2026-11-18T19:00:00+01:00"),
      q("PHQ9", [1, 1, 2, 0, 0, 1, 0, 0, 0], "2026-10-05T19:00:00+02:00"),
      q("PHQ9", [2, 1, 2, 1, 1, 1, 1, 0, 0], "2026-11-19T19:00:00+01:00", remission: 3),
    ]
    let c = PlanPageContent.build(inputs(qs: qs))
    XCTAssertEqual(c.date, "23 Nov 2026")
    XCTAssertEqual(c.status.first, "Hearth is still learning my usual pattern.")
    XCTAssertEqual(c.status.last, "Latest questionnaire: PHQ-9 on 19 Nov 2026, score 9 of 27. Range: mild; +6 from my reference score; a clear change from my usual score.")
    XCTAssertEqual(c.earlySigns, [
      .init(text: "“I go to bed later and later”", how: "Measured: middle of my night gets later"),
      .init(text: "“I stop going to the gym”", how: "Measured: visits to the gym go down"),
      .init(text: "“stop replying to messages”", how: "Asked at check-ins: Did you reply to messages today?"),
    ])
    XCTAssertEqual(c.earlyDo, [.init(text: "Call my sister", how: nil), .init(text: "Cook a proper meal", how: "If that is too much: Make toast")])
    XCTAssertEqual(c.earlyOthers, ["Maya: a walk and a talk", "Someone I trust"])
    XCTAssertEqual(c.crisisSigns, "I stop eating")
    XCTAssertEqual(c.crisisDo, ["Go to my sister's place", "Call 113 Zelfmoordpreventie (113)."])
    XCTAssertEqual(c.crisisOthers, ["My sister Anna", "GP or out-of-hours GP service. Emergency: 112."])
    // The last four, oldest first.
    XCTAssertEqual(c.questionnaires.map(\.date).dropFirst(), ["5 Oct 2026", "18 Nov 2026", "19 Nov 2026"])
    XCTAssertTrue(c.questionnaires[0].date.hasPrefix("20 Sep"))
    XCTAssertEqual(c.questionnaires.map(\.score), ["1 / 6", "5 / 27", "3 / 6", "9 / 27"])
    XCTAssertEqual(c.questionnaires[2].note, "At or above the usual cut-off of 3; PHQ-9 offered")
    XCTAssertTrue(c.footer.contains("Sensor data: own phone and watch."))
  }

  func testPlanPageWhenNothingIsWrittenAndAChangeIsOngoing() throws {
    var inp = inputs()
    inp.rules = []; inp.items = []; inp.actions = []; inp.people = []; inp.safety = nil
    inp.line = .init(name: "988 Lifeline", phone: nil, alt_phone: nil, url: "https://988lifeline.org", emergency: nil)
    inp.simulated = true
    let rec = { (date: String, state: String, phrases: [String]) -> DayRecordValue in
      var o: [String: Any] = ["date": date, "z": [String: Any](), "r": [String: Any](), "domainScores": [String: Any](), "maskedDomains": [String]()]
      o["features"] = ["date": date, "dayType": "weekday", "values": [String: Any]()] as [String: Any]
      o["S"] = 0; o["C"] = 0; o["elevated"] = state != "MONITOR"; o["state"] = state
      o["contributors"] = phrases.map { ["feature": "steps", "r": 1.5, "phrase": $0] as [String: Any] }
      return try! JSONText.decode(DayRecordValue.self, JSONText.encode(o))
    }
    inp.records = [rec("2026-11-20", "MONITOR", []), rec("2026-11-21", "ELEVATED", []), rec("2026-11-22", "ELEVATED", ["fewer steps than usual (5 days)"])]
    let c = PlanPageContent.build(inp)
    XCTAssertEqual(c.status, ["Since 21 Nov 2026 (2 days), Hearth has noticed a change from my usual pattern. Main changes on 22 Nov 2026: fewer steps than usual (5 days)."])
    XCTAssertTrue(c.earlySigns.isEmpty && c.earlyDo.isEmpty && c.earlyOthers.isEmpty && c.questionnaires.isEmpty)
    XCTAssertEqual(c.crisisSigns, "Not written down yet.")
    XCTAssertEqual(c.crisisDo, ["Call 988 Lifeline."])
    XCTAssertEqual(c.crisisOthers, ["GP or out-of-hours GP service."])
    XCTAssertTrue(c.footer.contains("simulated (demo person)"))
    // R9: no diagnostic words anywhere on the page.
    let all = (c.status + [c.crisisSigns, c.footer, c.stableSigns, c.earlyDoNote]).joined(separator: " ").lowercased()
    for word in ["depress", "relapse detected", "disorder", "symptom"] { XCTAssertFalse(all.contains(word), word) }
  }

  func testSummaryContentHasWeeklyNumbersOnly() throws {
    func week(_ w: String, mood: Double?, phq9: Int?, flagged: Bool?, contexts: [String], top: [String]) throws -> WeekAggregateValue {
      var o: [String: Any] = ["isoWeek": w, "daysWithData": 7, "indexMean": 0.42, "daysElevated": 2]
      o["domainMeans"] = ["activity": 0.3]
      o["topContributors"] = top
      o["ema"] = ["n": mood == nil ? 0 : 2, "mood_low": mood.map { $0 as Any } ?? NSNull(), "enjoyment": NSNull(), "energy": NSNull()] as [String: Any]
      o["phq2"] = NSNull()
      o["phq9"] = phq9.map { $0 as Any } ?? NSNull()
      o["phq9Flagged"] = flagged.map { $0 as Any } ?? NSNull()
      o["contexts"] = contexts
      o["note"] = ["text": "a private note"]
      return try JSONText.decode(WeekAggregateValue.self, JSONText.encode(o))
    }
    var weeks = try (1...14).map { try week(String(format: "2026-W%02d", 30 + $0), mood: nil, phq9: nil, flagged: nil, contexts: [], top: []) }
    weeks.append(try week("2026-W45", mood: 3.5, phq9: 14, flagged: true, contexts: ["holiday"], top: ["steps", "place_visits:p1"]))
    let c = SummaryPageContent.build(weeks: weeks.shuffled(), today: "2026-11-23") { w in
      (try? JSONText.decode([String].self, Engine.shared.call("datesOfIsoWeek", w)))?.first
    }
    XCTAssertEqual(c.rows.count, 12)
    let last = try XCTUnwrap(c.rows.last)
    XCTAssertEqual(last.week, "2 Nov")
    XCTAssertEqual(last.index, "0.42")
    XCTAssertEqual(last.down, "3.5")
    XCTAssertEqual(last.phq9, "14 ⚑")
    XCTAssertEqual(last.phq2, "–")
    XCTAssertEqual(last.signals, "Steps, Visits to a place")
    XCTAssertEqual(last.context, "On holiday")
    XCTAssertEqual(c.rows.first?.signals, "–")
    XCTAssertFalse(c.text.contains("private note"))
    XCTAssertTrue(c.text.contains("Week of 2 Nov: 7 days with data. Index 0.42. Changed days 2."))
    XCTAssertEqual(SummaryPageContent.build(weeks: [], today: "2026-11-23") { _ in nil }.rows, [])
  }

  // PDF ----------------------------------------------------------------------------------------

  /// Renders the page once, checks the PDF is one A4 page, and writes the PDF and a PNG of it
  /// to the temporary folder to look at.
  private func checkPDF<V: View>(_ page: V, name: String) throws -> PDFDocument {
    let data = A4.pdf(page, title: name)
    let doc = try XCTUnwrap(PDFDocument(data: data))
    XCTAssertEqual(doc.pageCount, 1, name)
    let box = try XCTUnwrap(doc.page(at: 0)).bounds(for: .mediaBox)
    XCTAssertEqual(box.width, 595.28, accuracy: 0.01, name)
    XCTAssertEqual(box.height, 841.89, accuracy: 0.01, name)
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("clinician-pdf", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    try data.write(to: dir.appendingPathComponent("\(name).pdf"))
    let png = try XCTUnwrap(doc.page(at: 0)).thumbnail(of: CGSize(width: 1190, height: 1684), for: .mediaBox).pngData()
    try png?.write(to: dir.appendingPathComponent("\(name).png"))
    print("PDF written to \(dir.path)/\(name).pdf")
    return doc
  }

  func testPlanPagePDFIsOneA4Page() throws {
    let qs = try [q("PHQ2", [2, 1], "2026-11-18T19:00:00+01:00"), q("PHQ9", [2, 1, 2, 1, 1, 1, 1, 0, 0], "2026-11-19T19:00:00+01:00", remission: 3)]
    let doc = try checkPDF(PlanPageView(content: PlanPageContent.build(inputs(qs: qs))), name: "plan-page")
    let text = doc.string ?? ""
    for s in ["Relapse prevention plan", "1. Current status", "2. Plan by phase", "3. Questionnaires", "I go to bed later and later", "About this document."] {
      XCTAssertTrue(text.contains(s), s)
    }
    XCTAssertEqual(doc.documentAttributes?[PDFDocumentAttribute.titleAttribute] as? String, "plan-page")
  }

  func testAVeryLongPlanStillPrintsOnOnePage() throws {
    var inp = inputs()
    inp.actions = (1...40).map { .init(id: "a\($0)", text: "Something that helps me, number \($0), written out at some length", quote: "q", active: true, smaller: "A smaller version of it") }
    _ = try checkPDF(PlanPageView(content: PlanPageContent.build(inp)), name: "plan-page-long")
  }

  func testSummaryPagePDFIsOneA4Page() throws {
    let weeks = try (35...46).map { (n: Int) -> WeekAggregateValue in
      var w: [String: Any] = ["isoWeek": "2026-W\(n)", "daysWithData": 7, "indexMean": Double(n) / 100, "daysElevated": n > 44 ? 5 : 0]
      w["domainMeans"] = [String: Any]()
      w["topContributors"] = ["rest_midpoint", "steps", "active_hours"]
      w["ema"] = ["n": 0, "mood_low": NSNull(), "enjoyment": NSNull(), "energy": NSNull()] as [String: Any]
      w["phq2"] = n == 45 ? 3 as Any : NSNull()
      w["phq9"] = n == 46 ? 12 as Any : NSNull()
      w["phq9Flagged"] = n == 46
      w["contexts"] = n == 40 ? ["holiday", "visitors"] : [String]()
      return try JSONText.decode(WeekAggregateValue.self, JSONText.encode(w))
    }
    let c = SummaryPageContent.build(weeks: weeks, today: "2026-11-23") { w in (try? JSONText.decode([String].self, Engine.shared.call("datesOfIsoWeek", w)))?.first }
    let doc = try checkPDF(SummaryPageView(content: c), name: "summary-page")
    XCTAssertTrue((doc.string ?? "").contains("Weekly data"))
  }
}
