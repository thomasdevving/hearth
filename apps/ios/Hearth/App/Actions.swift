import Foundation

// What the user does, in one place (mirror of apps/web/src/app/actions.ts). Every decision
// (scores, crisis keywords, PHQ rules, quote checks) is made by the engine.

extension AppModel {
  // Free text: crisis keywords first, then task H (context) and task B (markers) ----------

  /// Returns true when the safety flow was opened.
  @discardableResult
  func processFreeText(_ text: String, date: String, diaryId: String) async -> Bool {
    let crisis = (try? Engine.shared.call("detectCrisis", text)) == "true"
    let lang = (try? Engine.shared.call("languageFeatures", text)) ?? "null"
    store.context.insert(DiaryEntry(id: diaryId, date: date, text: text, markersJSON: nil, markersSource: "none", languageJSON: lang == "null" ? nil : lang))
    changed()
    if crisis { openSafety("keyword"); return true }

    // Task H: context (S3, on-device only). Nothing changes until the user confirms.
    let h = await router.run("H", input: ["text": text], options: .init(sourceText: text, verify: ["sourceText": text, "today": date]))
    if h.ok, let found = h.decode(VerifiedContext.self) {
      store.addInbox("context_confirm", date: date) {
        $0.contextJSON = JSONText.encode(Self.label(from: found, source: "model", confirmed: false))
        $0.sourceText = text
        $0.ranOn = h.ranOn
      }
    } else if !h.ok {
      // No model: the one-tap context picker (docs/05 §3).
      store.addInbox("context_confirm", date: date) {
        $0.contextJSON = JSONText.encode(Self.emptyLabel(date))
        $0.sourceText = text
        $0.ranOn = "none"
      }
    }

    // Task B: diary markers (S3). Display only (R6).
    let b = await router.run("B", input: ["text": text], options: .init(sourceText: text))
    if b.ok, let markers = b.decode(DiaryMarkers.self) {
      if let entry = store.first(DiaryEntry.self, where: #Predicate { $0.id == diaryId }) {
        entry.markersJSON = b.json; entry.markersSource = b.ranOn
      }
      if markers.crisis != "none" { changed(); openSafety("model_crisis"); return true }
    }
    changed()
    return false
  }

  static func label(from v: VerifiedContext, source: String, confirmed: Bool) -> [String: Any] {
    ["id": newId("ctx"), "type": v.type, "kind": v.kind, "start": v.start, "end": v.end, "quote": v.quote, "source": source, "confirmed": confirmed]
  }
  static func emptyLabel(_ date: String) -> [String: Any] {
    ["id": newId("ctx"), "type": "", "kind": "explains_sensors", "start": date, "end": Clock.addDays(date, 6), "quote": NSNull(), "source": "manual", "confirmed": false]
  }

  func confirmContext(_ label: ContextLabelValue, inbox: InboxItem?) {
    let table = (JSONText.object((try? Engine.shared.value("CONTEXT_TABLE")) ?? "{}") as? [String: [String: Any]]) ?? [:]
    let kind = table[label.type]?["kind"] as? String ?? label.kind
    let obj: [String: Any] = [
      "id": label.id, "type": label.type, "kind": kind, "start": label.start, "end": label.end,
      "quote": label.quote.map { $0 as Any } ?? NSNull(), "source": label.source, "confirmed": true,
    ]
    store.context.insert(ContextLabel(id: label.id, json: JSONText.encode(obj), confirmed: true))
    if let inbox { store.close(inbox, "done") }
    changed()
  }

  func rejectContext(_ inbox: InboxItem) { store.close(inbox, "dismissed"); changed() }

  /// A note written outside a check-in (docs/DECISIONS.md, M3).
  func submitNote(_ text: String) async {
    let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !t.isEmpty else { return }
    await processFreeText(t, date: Clock.today, diaryId: newId("note"))
  }

  // Check-ins ------------------------------------------------------------------------------

  struct CheckinSubmission {
    var mood_low: Int, enjoyment: Int, energy: Int, company: String
    var personal: [String: String]
    var freeText: String?
  }

  /// Returns (safety opened, PHQ-2 offered).
  func completeCheckin(id: String, _ a: CheckinSubmission) async -> (safety: Bool, offerPhq2: Bool) {
    guard let row = store.first(CheckinRecord.self, where: #Predicate { $0.id == id }),
          var obj = JSONText.object(row.json) as? [String: Any] else { return (false, false) }
    let date = String(row.scheduledAt.prefix(10))
    let text = a.freeText?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    obj["answeredAt"] = Clock.nowStamp
    obj["answers"] = ["mood_low": a.mood_low, "enjoyment": a.enjoyment, "energy": a.energy, "company": a.company]
    obj["personalAnswers"] = a.personal
    obj["hasFreeText"] = text != nil
    row.json = JSONText.encode(obj)
    for item in store.openInbox() where item.type == "checkin" && item.checkinId == id { store.close(item) }
    store.save()

    let since = Clock.addDays(date, -14)
    let input: [String: Any] = [
      "record": RawJSON(row.json), "freeText": text.map { $0 as Any } ?? NSNull(),
      "recentCheckins": store.all(CheckinRecord.self).filter { String($0.scheduledAt.prefix(10)) > since }.map { RawJSON($0.json) },
      "questionnaires": store.all(QuestionnaireRecord.self).map { RawJSON($0.json) },
      "state": currentState.rawValue, "date": date, "cfg": Shared.config,
    ]
    let out = (try? Engine.shared.decode(CheckinOutput.self, "onCheckinCompleted", input)) ?? CheckinOutput(crisis: false, momentaryHigh: false, offerPhq2: false)
    var safety = false
    if out.crisis, let t = text {
      store.context.insert(DiaryEntry(id: id, date: date, text: t, markersJSON: nil, markersSource: "none", languageJSON: nil))
      openSafety("keyword")
      safety = true
    } else if let t = text {
      safety = await processFreeText(t, date: date, diaryId: id)
    }
    if out.offerPhq2 && !store.openInbox().contains(where: { $0.type == "questionnaire" }) {
      store.addInbox("questionnaire", date: Clock.today) { $0.instrument = "PHQ2"; $0.reason = "momentary" }
    }
    changed()
    return (safety, out.offerPhq2)
  }

  /// "Not today": the check-in counts as ignored.
  func skipCheckin(id: String) {
    for item in store.openInbox() where item.type == "checkin" && item.checkinId == id { store.close(item, "dismissed") }
    changed()
  }

  // Questionnaires ------------------------------------------------------------------------

  func submitQuestionnaire(_ instrument: String, answers: [Int], baseline: Bool = false) -> QuestionnaireRecordValue? {
    let today = Clock.today
    let qs = store.all(QuestionnaireRecord.self).map { RawJSON($0.json) }
    guard let ref = try? Engine.shared.call("remissionScore", qs, today),
          let result = try? Engine.shared.call("scoreQuestionnaire", instrument, answers, RawJSON(ref), Shared.config) else { return nil }
    let id = newId("q")
    let takenAt = Clock.nowStamp
    var rec: [String: Any] = ["id": id, "instrument": instrument, "takenAt": takenAt, "answers": answers, "result": RawJSON(result)]
    if baseline { rec["baseline"] = true }
    let json = JSONText.encode(rec)
    store.context.insert(QuestionnaireRecord(id: id, takenAt: takenAt, json: json))
    if let state = store.engineState, let next = try? Engine.shared.call("applyQuestionnaireResult", RawJSON(state.json), RawJSON(result), ["baseline": baseline]) {
      state.json = next
    }
    for item in store.openInbox() where item.type == "questionnaire" && item.instrument == instrument { store.close(item) }
    let value = try? JSONText.decode(QuestionnaireRecordValue.self, json)
    // A positive PHQ-2 leads to the PHQ-9, unless one was taken in the last week (DECISIONS M4).
    let cooldown = (JSONText.object(Shared.configJSON) as? [String: Any])?["phq2CooldownDays"] as? Int ?? 7
    let recent9 = store.all(QuestionnaireRecord.self).compactMap(\.value).contains {
      $0.instrument == "PHQ9" && $0.id != id && Clock.addDays(String($0.takenAt.prefix(10)), cooldown) > today
    }
    if instrument == "PHQ2", value?.result.positive == true, !recent9 {
      store.addInbox("questionnaire", date: today) { $0.instrument = "PHQ9"; $0.reason = "persistent" }
    }
    changed()
    if value?.result.safetyItemPositive == true { openSafety("phq9_item9") }
    return value
  }

  func dismissQuestionnaire(_ instrument: String) {
    for item in store.openInbox() where item.type == "questionnaire" && item.instrument == instrument { store.close(item, "dismissed") }
    changed()
  }

  // For today (task K) -----------------------------------------------------------------------

  /// Task K: which of the user's own actions fit today. The model returns ids only, checked
  /// against the plan's ids (R8); the user's own text is shown (selection, not advice). Nil
  /// without a model or with nothing usable: then all actions are shown, as on the web.
  func pickForToday(actions: [PlanActionValue], today contributors: [String]) async -> (ids: [String], ranOn: String)? {
    guard actions.count >= 2 else { return nil }
    let ids = actions.map(\.id)
    let input: [String: Any] = ["today": contributors, "actions": actions.map { ["id": $0.id, "text": $0.text] }]
    let res = await router.run("K", input: input, options: .init(verify: ["actionIds": ids]))
    guard res.ok, let picked = (JSONText.object(res.json ?? "") as? [String: Any])?["action_ids"] as? [String], !picked.isEmpty else { return nil }
    return (picked, res.ranOn)
  }

  // Plan (task G) ----------------------------------------------------------------------------

  /// Saves the accepted cards. `places[i]` is the coordinate picked for a place rule; a place
  /// rule without one is not saved (DECISIONS M6).
  func savePlan(warning: String, helps: String, plan: VerifiedPlan, keepRules: [Bool], keepItems: [Bool], keepActions: [Bool], places: [Int: (lat: Double, lon: Double)]) {
    if let src = store.all(PlanSource.self).first { src.warning = warning; src.helps = helps } else {
      store.context.insert(PlanSource(warning: warning, helps: helps))
    }
    for r in store.all(PlanRule.self) { store.context.delete(r) }
    for r in store.all(PersonalItem.self) { store.context.delete(r) }
    for r in store.all(PlanAction.self) { store.context.delete(r) }
    var stateJSON = store.engineState?.json
    for (i, r) in plan.rules.enumerated() where keepRules[safe: i] == true {
      var placeId: Any = NSNull()
      if r.feature == "place_visits" {
        guard let p = places[i], let s = stateJSON,
              let out = try? Engine.shared.call("pickPlace", RawJSON(s), r.place_label ?? "place", p.lat, p.lon, Shared.config),
              let o = JSONText.object(out) as? [String: Any], let st = o["state"], let pid = o["placeId"] as? String else { continue }
        stateJSON = JSONText.encode(st)
        placeId = pid
      }
      let id = newId("rule")
      let obj: [String: Any] = ["id": id, "feature": r.feature, "direction": r.direction, "placeId": placeId, "quote": r.quote, "active": true]
      store.context.insert(PlanRule(id: id, json: JSONText.encode(obj)))
    }
    if let s = stateJSON { store.putEngineState(s) }
    for (i, it) in plan.personal_checkin_items.enumerated() where keepItems[safe: i] == true {
      let id = newId("item")
      store.context.insert(PersonalItem(id: id, json: JSONText.encode(["id": id, "question": it.question, "quote": it.quote, "active": true])))
    }
    for (i, a) in plan.actions.enumerated() where keepActions[safe: i] == true {
      let id = newId("action")
      store.context.insert(PlanAction(id: id, json: JSONText.encode(["id": id, "text": a.text, "quote": a.quote, "active": true])))
    }
    settings.planDone = true
    changed()
  }
}

extension String {
  var nilIfEmpty: String? { isEmpty ? nil : self }
}

extension Array {
  subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
