import Foundation

// Swift mirrors of the engine types the screens read (docs/07 §1). Field names are exactly
// the engine's. They are decoded from the engine's own JSON; records written back to the
// engine are stored as that JSON, so fields Swift does not model are never lost.

enum EngineStateName: String, Codable { case WARM_UP, MONITOR, ELEVATED, CONFIRMED }

struct Contributor: Codable, Hashable { var feature: String; var r: Double; var phrase: String }

struct FeatureDay: Codable {
  var date: String
  var dayType: String
  var values: [String: Double?]
  var restSource: String?
}

struct DayRecordValue: Codable {
  var date: String
  var features: FeatureDay
  var z: [String: Double?]
  var r: [String: Double?]
  var domainScores: [String: Double]
  var maskedDomains: [String]
  var D: Double?
  var D_daily: Double?
  var P: Double?
  var S: Double
  var C: Double
  var UCL: Double?
  var mu0: Double?
  var sigma0: Double?
  var elevated: Bool
  var contributors: [Contributor]
  var state: EngineStateName
}

struct Place: Codable, Hashable { var id: String; var lat: Double; var lon: Double; var minutes: Double; var label: String? }

struct EngineStateValue: Codable {
  var state: EngineStateName
  var places: [Place]
  var homePlaceId: String?
  var lastProcessedDate: String?
}

struct PlanRuleValue: Codable, Hashable {
  var id: String
  var feature: String
  var direction: String
  var placeId: String?
  var quote: String
  var active: Bool
}
struct PersonalItemValue: Codable, Hashable { var id: String; var question: String; var quote: String; var active: Bool }
struct PlanActionValue: Codable, Hashable {
  var id: String
  var text: String
  var quote: String
  var active: Bool
  /// The user's own smaller version for a day when the action is too much (S3, typed by the
  /// user, never written by a model).
  var smaller: String? = nil
}

struct ContextLabelValue: Codable, Hashable {
  var id: String
  var type: String
  var kind: String
  var start: String
  var end: String
  var quote: String?
  var source: String
  var confirmed: Bool
}

struct CheckinAnswers: Codable, Hashable {
  var mood_low: Double?
  var enjoyment: Double?
  var energy: Double?
  var company: String?
}

struct CheckinRecordValue: Codable, Hashable {
  var id: String
  var scheduledAt: String
  var answeredAt: String?
  var kind: String
  var reasons: [Contributor]
  var answers: CheckinAnswers
  var personalAnswers: [String: String]
  var hasFreeText: Bool
}

struct QuestionnaireResult: Codable, Hashable {
  var id: String
  var total: Int
  var band: String?
  var positive: Bool
  var flagged: Bool
  var changeFromReference: Int?
  var safetyItemPositive: Bool
  var nextStep: String
}

struct QuestionnaireRecordValue: Codable, Hashable {
  var id: String
  var instrument: String
  var takenAt: String
  var answers: [Int]
  var result: QuestionnaireResult
}

struct RouteDecision: Codable, Hashable {
  var run: String            // "model" | "fallback"
  var mode: String?          // ONLY_ON_DEVICE | PREFER_ON_DEVICE | PREFER_IN_CLOUD | ONLY_IN_CLOUD
  var variant: String?       // full | lite
  var reason: String?        // no_model | no_consent | offline
}

struct LedgerEntryValue: Codable, Hashable {
  var id: String
  var at: String
  var task: String
  var promptVersion: String
  var dataClass: String
  var decision: RouteDecision
  var ranOn: String          // on_device | cloud | none
  var outcome: String        // ok | invalid_output | error | fallback
  var attempts: Int
  var latencyMs: Int?
  var bytesSent: Int
  var payloadSent: String?
}

struct DiaryMarkers: Codable, Hashable {
  var negative_affect: Int
  var anhedonic_language: Int
  var social_withdrawal: Int
  var hopelessness: Int
  var sleep_complaint: Bool
  var themes: [String]
  var crisis: String
}

struct VerifiedRule: Codable, Hashable { var feature: String; var direction: String; var place_label: String?; var quote: String }
struct VerifiedItem: Codable, Hashable { var question: String; var quote: String }
struct VerifiedAction: Codable, Hashable { var text: String; var quote: String }
struct VerifiedPlan: Codable, Hashable {
  var rules: [VerifiedRule]
  var personal_checkin_items: [VerifiedItem]
  var actions: [VerifiedAction]
  var dropped: Int
  var valid: Bool
  static let empty = VerifiedPlan(rules: [], personal_checkin_items: [], actions: [], dropped: 0, valid: true)
}

struct VerifiedContext: Codable, Hashable {
  var type: String
  var kind: String
  var start: String
  var end: String
  var quote: String
  var confidence: String
  var startResolved: Bool
  var endResolved: Bool
}

struct CheckinOutput: Codable { var crisis: Bool; var momentaryHigh: Bool; var offerPhq2: Bool }

/// docs/04 §8 `Action`.
struct EngineAction: Codable {
  var type: String           // schedule_checkin | offer_questionnaire | show_plan | context_expired
  var kind: String?
  var reasons: [Contributor]?
  var id: String?            // PHQ2 | PHQ9
  var reason: String?
  var contextId: String?
}

struct WeekAggregateValue: Codable {
  struct Ema: Codable { var n: Int; var mood_low: Double?; var enjoyment: Double?; var energy: Double? }
  var isoWeek: String
  var daysWithData: Int
  var indexMean: Double?
  var daysElevated: Int
  var domainMeans: [String: Double]
  var topContributors: [String]
  var ema: Ema
  var phq2: Int?
  var phq9: Int?
  var phq9Flagged: Bool?
  var contexts: [String]
  /// The note in the user's own voice, only after they approved it (task P, class S1).
  struct Note: Codable, Equatable { var themes: [String]?; var text: String }
  var note: Note?
}

// Questionnaires and safety lists from shared/ -----------------------------------------

struct QuestionnaireDef: Codable {
  struct Option: Codable, Hashable { var label: String; var value: Int }
  struct Item: Codable, Hashable { var n: Int; var text: String }
  var id: String
  var title: String
  var stem: String
  var options: [Option]
  var items: [Item]
}

struct MomentaryDef: Codable {
  struct Item: Codable, Hashable {
    var id: String
    var text: String
    var type: String
    var min: Int?
    var max: Int?
    var min_label: String?
    var max_label: String?
    var options: [String]?
  }
  var items: [Item]
  var personal_item_options: [String]
  var free_text_prompt: String
}

struct CrisisLines: Codable {
  struct Line: Codable, Hashable { var name: String; var phone: String?; var alt_phone: String?; var url: String; var emergency: String? }
  var `default`: Line
  var countries: [String: Line]
  var emergency_text: String
}

// Explanations (packages/engine/src/explain.ts) ------------------------------------------

/// `UsualPoint`: one day of a signal against the usual range it was scored with.
struct UsualPoint: Codable, Hashable {
  var date: String
  var value: Double?
  var median: Double?
  var low: Double?
  var high: Double?
  var z: Double?
}

/// `WhyTimeline`: the latest changed stretch, the single day that did not count, and how long
/// the trend had been rising before it crossed the limit.
struct WhyTimelineValue: Codable, Hashable {
  struct Episode: Codable, Hashable { var start: String; var end: String? }
  struct SingleDay: Codable, Hashable { var date: String; var D: Double; var UCL: Double }
  var episode: Episode?
  var singleDay: SingleDay?
  var risingDays: Int
}

/// `SignalOnset` (packages/engine/src/explain.ts): when one signal first moved in the latest
/// stretch, counted by the engine.
struct SignalOnsetValue: Codable, Hashable {
  var feature: String
  /// The rule in the user's plan that watches this signal, if any.
  var ruleId: String?
  var firstDate: String?
  /// Days before the stretch started (negative: after it started).
  var daysBefore: Int?
  var direction: String?
}

/// `OnsetResult`: the latest stretch, the signals that moved (earliest first) and the plan's
/// signs that did not move.
struct OnsetResultValue: Codable, Hashable {
  struct Episode: Codable, Hashable { var start: String; var end: String? }
  var episode: Episode
  var moved: [SignalOnsetValue]
  var unchanged: [SignalOnsetValue]
}
