import SwiftData
import UIKit
import XCTest
@testable import Hearth

/// The last web features on iOS: ask your data (Q), the weekly note (P), the weekly reflection
/// (D), scanning a paper plan (G2) and the spoken check-in (I). Every model output is checked
/// in code (R8), numbers come from the engine (R2), S3 stays on the device (R3), and S1 goes to
/// the cloud only with consent and the exact payload the user approved (R4).
@MainActor
final class ParityTests: XCTestCase {
  private var container: ModelContainer!
  private var app: AppModel!

  override func setUp() async throws {
    container = try Store.makeContainer(inMemory: true)
    app = AppModel(store: Store(context: container.mainContext))
    app.settings.onDeviceEnabled = false   // deterministic: no model even where one exists
  }

  override func tearDown() async throws {
    for k in ["HearthDemo", "HearthDemoAsk", "HearthDemoNote", "HearthDemoSpoken", "HearthDemoScan", "HearthDemoCloud"] {
      UserDefaults.standard.removeObject(forKey: k)
    }
  }

  private var ledger: [LedgerEntryValue] { app.store.all(LedgerEntry.self).compactMap(\.value) }

  private func demo(_ keys: String...) {
    UserDefaults.standard.set(true, forKey: "HearthDemo")
    for k in keys { UserDefaults.standard.set(true, forKey: k) }
  }

  private func verify(_ task: String, _ raw: String, _ ctx: [String: Any] = [:]) throws -> [String: Any] {
    try XCTUnwrap(JSONText.object(Engine.shared.call("verifyTask", task, RawJSON(raw), ctx)) as? [String: Any])
  }

  /// Day records with a rest length per day: 8 h before `from`, `recent` h from `from` on.
  private func addRecords(through last: String, days: Int, from: String, recent: Double) {
    for k in stride(from: days - 1, through: 0, by: -1) {
      let date = Clock.addDays(last, -k)
      let rest = date >= from ? recent : 8.0
      let json = #"{"date":"\#(date)","features":{"date":"\#(date)","dayType":"weekday","values":{"rest_duration":\#(rest)}},"z":{},"r":{},"domainScores":{},"maskedDomains":[],"D":0.5,"D_daily":0.5,"P":null,"S":0,"C":0,"UCL":1,"mu0":0,"sigma0":1,"elevated":false,"contributors":[],"state":"MONITOR"}"#
      app.store.context.insert(DayRecord(date: date, json: json, state: "MONITOR"))
    }
    app.store.save()
  }

  // Q · Ask your data -------------------------------------------------------------------------

  func testClassificationIsValidatedTwice() throws {
    XCTAssertEqual(try verify("Q_classify", #"{"intent":"compare","feature":"rest_duration","period":"last_week"}"#)["ok"] as? Bool, true)
    XCTAssertEqual(try verify("Q_classify", #"{"intent":"diagnose","feature":"rest_duration","period":"last_week"}"#)["ok"] as? Bool, false)
    XCTAssertEqual(try verify("Q_classify", #"{"intent":"trend","feature":"rest_duration"}"#)["ok"] as? Bool, false)
    XCTAssertEqual(Ask.classification(#"{"intent":"trend","feature":"steps","period":"today"}"#), Ask.Classification(intent: "trend", feature: "steps", period: "today"))
    XCTAssertNil(Ask.classification(#"{"intent":"trend","feature":"weight","period":"today"}"#))
    XCTAssertNil(Ask.classification(#"{"intent":"trend","feature":"steps","period":"yesterday"}"#))
    XCTAssertNil(Ask.classification("not json"))
    XCTAssertNil(Ask.classification(nil))
  }

  func testAnswerNumbersAreComputedByTheEngine() throws {
    // Monday 16 March 2026: last week is 9–15 March.
    addRecords(through: "2026-03-15", days: 70, from: "2026-03-09", recent: 6.5)
    let facts = Ask.facts(.init(intent: "compare", feature: "rest_duration", period: "last_week"), store: app.store, today: "2026-03-16")
    let f = try XCTUnwrap(JSONText.object(facts) as? [String: Any])
    XCTAssertEqual(f["value"] as? String, "6.5 hours")
    XCTAssertEqual(f["usual"] as? String, "8.0 hours")
    XCTAssertEqual(f["direction"] as? String, "lower")
    XCTAssertEqual(f["days"] as? Int, 7)
    XCTAssertEqual(Ask.template(facts), "Your rest length for last week was 6.5 hours, against 8.0 hours for your usual (lower).")
    // Phrasing: a number that is not in the facts is rejected (R2, R8).
    XCTAssertEqual(try verify("Q_phrase", #"{"answer":"Your rest was 6.5 hours, below your usual 8.0 hours."}"#, ["facts": RawJSON(facts)])["ok"] as? Bool, true)
    XCTAssertEqual(try verify("Q_phrase", #"{"answer":"Your rest was 6 hours, 2 below usual."}"#, ["facts": RawJSON(facts)])["ok"] as? Bool, false)
    XCTAssertEqual(try verify("Q_phrase", #"{"answer":"This looks like depression."}"#, ["facts": RawJSON(facts)])["ok"] as? Bool, false)
    let unsupported = Ask.facts(.init(intent: "unsupported", feature: "none", period: "none"), store: app.store)
    XCTAssertTrue(Ask.template(unsupported).hasPrefix("I can only answer questions about your own signals"))
  }

  func testAskWithoutModelStaysOnTheDevice() async {
    let a = await app.ask("How was my rest last week compared with usual?")
    XCTAssertEqual(a, AskAnswer(text: Ask.notRead, ranOn: "template"))
    XCTAssertEqual(ledger.count, 1)
    XCTAssertEqual(ledger.first?.task, "Q")
    XCTAssertEqual(ledger.first?.dataClass, "S3")   // the question is the user's own words
    XCTAssertEqual(ledger.first?.ranOn, "none")
    XCTAssertEqual(ledger.first?.bytesSent, 0)
    XCTAssertFalse(app.askAvailable)
  }

  func testAskWithCrisisWordsOpensSupportBeforeAnyModel() async {
    let a = await app.ask("I want to end my life")
    XCTAssertNil(a)
    XCTAssertEqual(app.safetyEntry, "keyword")
    XCTAssertTrue(ledger.isEmpty)
  }

  #if DEBUG
  func testAskStandInIsVerifiedAndLedgered() async {
    demo("HearthDemoAsk")
    addRecords(through: Clock.addDays(Clock.today, -1), days: 70, from: Clock.addDays(Clock.today, -14), recent: 6.5)
    XCTAssertTrue(app.askAvailable)
    let a = await app.ask("How was my rest last week compared with usual?")
    XCTAssertEqual(a?.ranOn, "on_device")
    XCTAssertTrue(a?.text.contains("hours") == true)
    // Two calls: classify (S3) and phrase (S2, facts only), both on the device.
    XCTAssertEqual(ledger.map(\.promptVersion).sorted(), ["Q_classify@\(Shared.prompt("Q_classify").version)", "Q_phrase@\(Shared.prompt("Q_phrase").version)"])
    XCTAssertEqual(Set(ledger.map(\.dataClass)), ["S2", "S3"])
    XCTAssertTrue(ledger.allSatisfy { $0.task == "Q" && $0.ranOn == "on_device" && $0.outcome == "ok" && $0.bytesSent == 0 && $0.payloadSent == nil })
    // A question the classifier cannot place gets the fixed reply, without a phrasing call.
    let u = await app.ask("What is the capital of France?")
    XCTAssertEqual(u?.ranOn, "template")
    XCTAssertEqual(ledger.count, 3)
  }
  #endif

  // G2 · Scan a paper plan --------------------------------------------------------------------

  func testScanQuoteCheck() {
    let ocr = "My early warning signs\nI go to bed later and later\nI stop going to the gym"
    XCTAssertEqual(PlanScan.verified(model: "I go to bed later and later\nI stop going to the gym", ocr: ocr), "I go to bed later and later\nI stop going to the gym")
    // An added line, or a changed word, is not in the photo: the model's text is discarded.
    XCTAssertNil(PlanScan.verified(model: "I go to bed later and later\nI drink more", ocr: ocr))
    XCTAssertNil(PlanScan.verified(model: "I never go to bed later", ocr: ocr))
    XCTAssertNil(PlanScan.verified(model: "I go to bed later\nno", ocr: ocr))   // short word not in the text
    XCTAssertNil(PlanScan.verified(model: "  \n ", ocr: ocr))
    XCTAssertEqual(PlanScan.verified(model: "My early warning signs\n-\nI stop going to the gym", ocr: ocr), "My early warning signs\n-\nI stop going to the gym")
  }

  func testScanWithoutModelUsesTheRecognisedText() async {
    let out = await app.transcribePlan(lines: ["I stop going to the gym", "Calling my sister helps"])
    XCTAssertEqual(out?.text, "I stop going to the gym\nCalling my sister helps")
    XCTAssertEqual(out?.ranOn, "template")
    XCTAssertEqual(ledger.first?.task, "G2")
    XCTAssertEqual(ledger.first?.dataClass, "S3")
    XCTAssertEqual(ledger.first?.ranOn, "none")
    let empty = await app.transcribePlan(lines: [])
    XCTAssertNil(empty)
  }

  #if DEBUG
  func testScanReadsAPhotoOnTheDevice() async throws {
    demo("HearthDemoScan")
    let image = try XCTUnwrap(ScanPlanButton.demoImage().cgImage)
    let lines = try await PlanScan.recognize(image)
    XCTAssertTrue(lines.joined(separator: " ").lowercased().contains("gym"), "\(lines)")
    let out = await app.transcribePlan(lines: lines)
    XCTAssertEqual(out?.ranOn, "on_device")
    XCTAssertEqual(out?.text, lines.joined(separator: "\n"))
    XCTAssertTrue(ledger.allSatisfy { $0.task == "G2" && $0.ranOn == "on_device" && $0.bytesSent == 0 })
  }
  #endif

  // I · Spoken check-in -----------------------------------------------------------------------

  func testSpokenAnswersAreChecked() throws {
    let text = "I replied to Maya this morning, but stayed in all day."
    let v = try verify("I", #"{"answers":[{"item_id":"i1","answer":"yes","quote":"I replied to Maya"},{"item_id":"i9","answer":"no","quote":"stayed in"},{"item_id":"i2","answer":"no","quote":"went to the gym"}]}"#, ["sourceText": text, "itemIds": ["i1", "i2"]])
    XCTAssertEqual(v["ok"] as? Bool, true)
    let answers = AppModel.spokenAnswers(JSONText.encode(v["value"]), ids: ["i1", "i2"])
    XCTAssertEqual(answers, ["i1": "yes"])   // unknown id and an invented quote are dropped
    XCTAssertEqual(AppModel.spokenAnswers(#"{"answers":[{"item_id":"i1","answer":"not_mentioned"},{"item_id":"i3","answer":"yes"}]}"#, ids: ["i1"]), [:])
    XCTAssertEqual(AppModel.spokenAnswers("nope", ids: ["i1"]), [:])
  }

  func testSpokenWithoutModelLeavesTheTapsToTheUser() async {
    let item = PersonalItemValue(id: "i1", question: "Did you reply to messages today?", quote: "stop replying to messages", active: true)
    let r = await app.answersFromSpeech("I replied to Maya", items: [item])
    XCTAssertNil(r)
    XCTAssertEqual(ledger.first?.task, "I")
    XCTAssertEqual(ledger.first?.ranOn, "none")
    XCTAssertEqual(ledger.first?.dataClass, "S3")
  }

  #if DEBUG
  func testSpokenStandIn() async {
    demo("HearthDemoSpoken")
    let items = [PersonalItemValue(id: "i1", question: "Did you reply to messages today?", quote: "stop replying", active: true),
                 PersonalItemValue(id: "i2", question: "Did you eat regular meals today?", quote: "eat badly", active: true)]
    let r = await app.answersFromSpeech("I replied to Maya this morning, but stayed in all day.", items: items)
    XCTAssertEqual(r, ["i1": "yes"])
    XCTAssertEqual(ledger.first?.ranOn, "on_device")
  }
  #endif

  // P · The note in your own voice --------------------------------------------------------------

  private func addWeek(_ isoWeek: String = "2026-W10") {
    let json = #"{"isoWeek":"\#(isoWeek)","daysWithData":7,"indexMean":0.8,"daysElevated":2,"domainMeans":{"sleep":0.6},"topContributors":["rest_midpoint"],"ema":{"n":1,"mood_low":3,"enjoyment":4,"energy":4},"phq2":null,"phq9":null,"contexts":[],"note":null}"#
    app.store.context.insert(WeekAggregate(isoWeek: isoWeek, json: json, uploaded: true))
    app.store.save()
  }

  func testWeekNoteNeedsTextAndAModel() async {
    addWeek()
    var s = await app.suggestWeekNote("2026-W10")
    XCTAssertEqual(s, .noText)
    XCTAssertTrue(ledger.isEmpty)
    app.store.context.insert(DiaryEntry(id: "d1", date: "2026-03-04", text: "Late nights, I barely left the flat.", markersJSON: nil, markersSource: "none", languageJSON: nil))
    app.store.context.insert(DiaryEntry(id: "d2", date: "2026-03-10", text: "Next week", markersJSON: nil, markersSource: "none", languageJSON: nil))
    s = await app.suggestWeekNote("2026-W10")
    XCTAssertEqual(s, .noModel)
    XCTAssertEqual(ledger.first?.task, "P")
    XCTAssertEqual(ledger.first?.dataClass, "S3")
    XCTAssertEqual(ledger.first?.ranOn, "none")
  }

  func testWeekNoteIsCheckedBeforeItIsStored() throws {
    addWeek()
    app.store.context.insert(Person(id: "p1", order: 0, name: "Maya", phone: "", goodFor: "", message: ""))
    XCTAssertFalse(app.setWeekNote("2026-W10", text: "A walk with maya helped."))       // a person's name
    XCTAssertFalse(app.setWeekNote("2026-W10", text: "Slept 5 hours most nights."))     // a number
    XCTAssertFalse(app.setWeekNote("2026-W10", text: "Work at Acme was heavy."))        // a capitalised name
    XCTAssertNil(app.weekAggregates.first?.note)
    XCTAssertTrue(app.setWeekNote("2026-W10", themes: ["sleep"], text: "  A slower week. Short walks helped a little.  "))
    let row = try XCTUnwrap(app.store.all(WeekAggregate.self).first)
    XCTAssertEqual(row.value?.note, .init(themes: ["sleep"], text: "A slower week. Short walks helped a little."))
    XCTAssertFalse(row.uploaded)
    XCTAssertTrue(app.setWeekNote("2026-W10", text: nil))
    XCTAssertNil(app.weekAggregates.first?.note)
    // P's model output is checked by the engine too: names and numbers are rejected.
    XCTAssertEqual(try verify("P", #"{"themes":["sleep"],"note":"A slower week."}"#, ["placeLabels": ["gym"]])["ok"] as? Bool, true)
    XCTAssertEqual(try verify("P", #"{"themes":["sleep"],"note":"Went to the gym twice."}"#, ["placeLabels": ["gym"]])["ok"] as? Bool, false)
    XCTAssertEqual(try verify("P", #"{"themes":["sleep"],"note":"Slept 5 hours."}"#)["ok"] as? Bool, false)
  }

  #if DEBUG
  func testWeekNoteStandIn() async {
    demo("HearthDemoNote")
    addWeek()
    app.store.context.insert(DiaryEntry(id: "d1", date: "2026-03-04", text: "Late nights, I barely left the flat.", markersJSON: nil, markersSource: "none", languageJSON: nil))
    let s = await app.suggestWeekNote("2026-W10")
    guard case .draft(let themes, let text, let ranOn) = s else { return XCTFail("\(s)") }
    XCTAssertEqual(ranOn, "on_device")
    XCTAssertEqual(themes, ["sleep", "activity"])
    XCTAssertTrue(app.weekNoteIsSafe(text))
    XCTAssertTrue(ledger.allSatisfy { $0.task == "P" && $0.ranOn == "on_device" && $0.bytesSent == 0 })
  }
  #endif

  // D · The weekly reflection -----------------------------------------------------------------

  func testReflectionWithoutConsentIsThePlainSummary() async {
    addWeek()
    app.settings.cloudConsent = false
    XCTAssertNil(app.weeklyCloudPayload())
    let r = await app.writeReflection(approved: nil)
    XCTAssertEqual(r.ranOn, "template")
    XCTAssertTrue(r.reflection.hasPrefix("In the week of "), r.reflection)
    XCTAssertFalse(r.reflection.contains("2026-W10"))
    XCTAssertEqual(ledger.count, 1)
    XCTAssertEqual(ledger.first?.dataClass, "S1")
    XCTAssertEqual(ledger.first?.decision.reason, "no_consent")
    XCTAssertEqual(ledger.first?.ranOn, "none")
    XCTAssertNil(ledger.first?.payloadSent)
  }

  #if DEBUG
  /// With consent and the cloud reachable, the router still refuses the cloud unless the user
  /// approved exactly the payload it would send. (The cloud call itself is never made here.)
  func testReflectionNeedsTheApprovedPayloadForTheCloud() async throws {
    demo("HearthDemoCloud")
    addWeek()
    app.settings.cloudConsent = true
    app.store.context.insert(DiaryEntry(id: "d1", date: "2026-03-04", text: "Late nights at the Blue Door cafe", markersJSON: nil, markersSource: "none", languageJSON: nil))
    let payload = try XCTUnwrap(app.weeklyCloudPayload())
    XCTAssertTrue(payload.hasPrefix(Shared.prompt("D").text))
    XCTAssertTrue(payload.contains(#""number of weeks":1"#))
    XCTAssertTrue(payload.contains("the week of"))
    XCTAssertFalse(payload.contains("2026-W10"))       // plain words, not codes
    XCTAssertFalse(payload.contains("Blue Door"))      // notes never go (S3)
    // Not approved, approved something else, or "on this device instead": no cloud attempt.
    for (approved, allow) in [(nil, true), (payload + " ", true), (payload, false)] as [(String?, Bool)] {
      let r = await app.writeReflection(approved: approved, allowCloud: allow)
      XCTAssertEqual(r.ranOn, "template")
    }
    XCTAssertEqual(ledger.count, 3)
    XCTAssertTrue(ledger.allSatisfy { $0.task == "D" && $0.ranOn == "none" && $0.bytesSent == 0 && $0.payloadSent == nil })
    // Without consent there is nothing to preview.
    app.settings.cloudConsent = false
    XCTAssertNil(app.weeklyCloudPayload())
  }
  #endif

  func testReadableWeekUsesPlainWords() {
    let w = try! JSONText.decode(WeekAggregateValue.self, #"{"isoWeek":"2026-W10","daysWithData":7,"indexMean":0.8,"daysElevated":2,"domainMeans":{"sleep":0.6},"topContributors":["rest_midpoint","rest_midpoint"],"ema":{"n":0},"phq2":null,"phq9":4,"contexts":["holiday"],"note":{"themes":[],"text":"A slower week."}}"#)
    let r = Weekly.readable(w)
    XCTAssertEqual(r["week"] as? String, "the week of 2 Mar")
    XCTAssertEqual(r["signals that moved most"] as? [String], ["Middle of your night"])
    XCTAssertEqual(r["change from usual by area"] as? [String: Double], ["rest": 0.6])
    XCTAssertTrue(r["check-ins"] is NSNull)
    XCTAssertEqual(r["what was going on"] as? [String], ["On holiday"])
    XCTAssertEqual(r["note in the person's own words"] as? String, "A slower week.")
    XCTAssertEqual(Weekly.input([w, w, w], variant: "lite")["number of weeks"] as? Int, 2)
  }
}
