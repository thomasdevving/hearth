import Foundation
import SwiftData

// The local store (docs/07 §2) as SwiftData models. One model per collection, named after the
// collection's record type. Each row keeps its key as a column and the record itself as the
// engine's JSON (`json`), with the field names of docs/07 §1, so it goes back into the engine
// unchanged. Everything here stays on the device; the store file uses file protection
// `complete` (see Store.makeContainer).

/// 2.1 `day_raw`, key `date`. Class S3.
@Model final class DayRaw {
  @Attribute(.unique) var date: String
  var json: String
  /// True when the record was read from HealthKit after the day had ended, so it is final
  /// enough to be scored.
  var complete: Bool
  var fetchedAt: Date
  init(date: String, json: String, complete: Bool, fetchedAt: Date = .now) {
    self.date = date; self.json = json; self.complete = complete; self.fetchedAt = fetchedAt
  }
}

/// 2.2 `day_records`, key `date`. Class S2.
@Model final class DayRecord {
  @Attribute(.unique) var date: String
  var json: String
  var state: String
  init(date: String, json: String, state: String) { self.date = date; self.json = json; self.state = state }
  var value: DayRecordValue? { try? JSONText.decode(DayRecordValue.self, json) }
}

/// 2.3 `engine_state`, singleton. Class S3 (contains places).
@Model final class EngineState {
  @Attribute(.unique) var key: String = "singleton"
  var json: String
  init(json: String) { self.json = json }
  var value: EngineStateValue? { try? JSONText.decode(EngineStateValue.self, json) }
}

/// 2.4 `plan_source`, singleton. The plan in the user's words. Class S3.
@Model final class PlanSource {
  @Attribute(.unique) var key: String = "singleton"
  var warning: String
  var helps: String
  init(warning: String, helps: String) { self.warning = warning; self.helps = helps }
}

/// 2.5 `plan_rules`, key `id`. Class S3.
@Model final class PlanRule {
  @Attribute(.unique) var id: String
  var json: String
  init(id: String, json: String) { self.id = id; self.json = json }
  var value: PlanRuleValue? { try? JSONText.decode(PlanRuleValue.self, json) }
}

/// 2.5 `personal_items`, key `id`. Class S3.
@Model final class PersonalItem {
  @Attribute(.unique) var id: String
  var json: String
  init(id: String, json: String) { self.id = id; self.json = json }
  var value: PersonalItemValue? { try? JSONText.decode(PersonalItemValue.self, json) }
}

/// 2.5 `plan_actions`, key `id`. Class S3.
@Model final class PlanAction {
  @Attribute(.unique) var id: String
  var json: String
  init(id: String, json: String) { self.id = id; self.json = json }
  var value: PlanActionValue? { try? JSONText.decode(PlanActionValue.self, json) }
}

/// 2.6 `contexts`, key `id`. Class S3.
@Model final class ContextLabel {
  @Attribute(.unique) var id: String
  var json: String
  var confirmed: Bool
  init(id: String, json: String, confirmed: Bool) { self.id = id; self.json = json; self.confirmed = confirmed }
  var value: ContextLabelValue? { try? JSONText.decode(ContextLabelValue.self, json) }
}

/// 2.7 `checkins`, key `id`. Class S2.
@Model final class CheckinRecord {
  @Attribute(.unique) var id: String
  var json: String
  var scheduledAt: String
  init(id: String, json: String, scheduledAt: String) { self.id = id; self.json = json; self.scheduledAt = scheduledAt }
  var value: CheckinRecordValue? { try? JSONText.decode(CheckinRecordValue.self, json) }
}

/// 2.8 `diary`, key = check-in or note id. Free text (S3), `DiaryMarkers`, `LanguageFeatures`.
@Model final class DiaryEntry {
  @Attribute(.unique) var id: String
  var date: String
  var text: String?
  var markersJSON: String?
  var markersSource: String
  var languageJSON: String?
  init(id: String, date: String, text: String?, markersJSON: String?, markersSource: String, languageJSON: String?) {
    self.id = id; self.date = date; self.text = text; self.markersJSON = markersJSON; self.markersSource = markersSource; self.languageJSON = languageJSON
  }
}

/// 2.9 `ledger`, key `id`.
@Model final class LedgerEntry {
  @Attribute(.unique) var id: String
  var at: String
  var json: String
  init(id: String, at: String, json: String) { self.id = id; self.at = at; self.json = json }
  var value: LedgerEntryValue? { try? JSONText.decode(LedgerEntryValue.self, json) }
}

/// 2.10 `questionnaires`, key `id`. Class S2.
@Model final class QuestionnaireRecord {
  @Attribute(.unique) var id: String
  var takenAt: String
  var json: String
  init(id: String, takenAt: String, json: String) { self.id = id; self.takenAt = takenAt; self.json = json }
  var value: QuestionnaireRecordValue? { try? JSONText.decode(QuestionnaireRecordValue.self, json) }
}

/// 2.11 `safety_plan`, singleton. Class S3.
@Model final class SafetyPlan {
  @Attribute(.unique) var key: String = "singleton"
  var warningSigns: String
  var helps: String
  var whoToCall: String
  init(warningSigns: String = "", helps: String = "", whoToCall: String = "") {
    self.warningSigns = warningSigns; self.helps = helps; self.whoToCall = whoToCall
  }
}

/// 2.11 `trusted_contact`, singleton. Class S3.
@Model final class TrustedContact {
  @Attribute(.unique) var key: String = "singleton"
  var name: String
  var phone: String
  init(name: String, phone: String) { self.name = name; self.phone = phone }
}

/// "My people" (call a friend): 1–3 people with a message in the user's own words. Class S3,
/// local only; Hearth never contacts them. Replaces the single trusted contact.
@Model final class Person {
  @Attribute(.unique) var id: String
  var order: Int
  var name: String
  var phone: String
  var goodFor: String
  var message: String
  init(id: String, order: Int, name: String, phone: String, goodFor: String, message: String) {
    self.id = id; self.order = order; self.name = name; self.phone = phone; self.goodFor = goodFor; self.message = message
  }
}

/// 2.12 `safety_events`, key `id`. Never uploaded.
@Model final class SafetyEvent {
  @Attribute(.unique) var id: String
  var at: String
  var entry: String
  init(id: String, at: String, entry: String) { self.id = id; self.at = at; self.entry = entry }
}

/// 2.13 `settings`, singleton.
@Model final class HearthSettings {
  @Attribute(.unique) var key: String = "singleton"
  var cloudConsent: Bool = false
  var onDeviceEnabled: Bool = true
  var onboarded: Bool = false
  var planDone: Bool = false
  var baselineDone: Bool = false
  var country: String = "US"
  var scheduleMode: String = "triggered"
  var firstUploadConfirmed: Bool = false
  var sensorSteps: Bool = true
  var sensorWalkingSpeed: Bool = true
  var sensorSleep: Bool = true
  var sensorHeart: Bool = true
  var sensorVisits: Bool = false
  var healthAuthorized: Bool = false
  init() {}
}

/// 2.14 `week_aggregates`, key `isoWeek`. Class S1.
@Model final class WeekAggregate {
  @Attribute(.unique) var isoWeek: String
  var json: String
  var uploaded: Bool
  init(isoWeek: String, json: String, uploaded: Bool) { self.isoWeek = isoWeek; self.json = json; self.uploaded = uploaded }
  var value: WeekAggregateValue? { try? JSONText.decode(WeekAggregateValue.self, json) }
}

/// App-side inbox (docs/DECISIONS.md, M4): the engine's actions as things to do today.
@Model final class InboxItem {
  @Attribute(.unique) var id: String
  var date: String
  var type: String          // checkin | questionnaire | context_confirm | context_expired | show_plan
  var status: String        // open | done | dismissed
  var checkinId: String?
  var instrument: String?   // PHQ2 | PHQ9
  var reason: String?
  var contextJSON: String?  // ContextLabel for context_confirm
  var contextId: String?    // context_expired
  var sourceText: String?   // the note a context came from (S3, local)
  var ranOn: String?
  init(id: String, date: String, type: String) { self.id = id; self.date = date; self.type = type; self.status = "open" }
}

enum HearthSchema {
  static let models: [any PersistentModel.Type] = [
    DayRaw.self, DayRecord.self, EngineState.self, PlanSource.self, PlanRule.self, PersonalItem.self,
    PlanAction.self, ContextLabel.self, CheckinRecord.self, DiaryEntry.self, LedgerEntry.self,
    QuestionnaireRecord.self, SafetyPlan.self, TrustedContact.self, SafetyEvent.self, HearthSettings.self,
    WeekAggregate.self, InboxItem.self, Person.self,
  ]
}
