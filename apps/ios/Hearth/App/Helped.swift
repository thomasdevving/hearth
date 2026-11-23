import Foundation

// "What helped me last time" (mirror of apps/web/src/app/helped.ts; docs/05 tasks R and T).
// Everything here stays on this device (S3): the notes, the recall and the drafted text. Both
// tasks run on the device only, through the router; without the model, recall finds no match
// (the user picks a sign) and the draft is the user's own saved or quoted message.

/// One of the user's active signs: a confirmed plan rule or one of their own check-in
/// questions. The quote is the user's own words and the key notes are attached to.
struct HelpedSign: Hashable {
  enum Kind: String { case rule, item }
  let quote: String
  let kind: Kind
  let id: String
}

/// What task R found: signs the check-in text describes, each with a quote from the text.
struct HelpedRecall: Equatable {
  struct Match: Hashable { let sign: HelpedSign; let quote: String }
  var matches: [Match]
  var ranOn: String   // on_device | none

  static let none = HelpedRecall(matches: [], ranOn: "none")
}

enum Helped {
  /// The voice note's maximum length, as on the web.
  static let maxSeconds = 15

  /// Active rules first, then active questions; one sign per wording.
  static func signs(rules: [PlanRuleValue], items: [PersonalItemValue]) -> [HelpedSign] {
    let all = rules.filter(\.active).map { HelpedSign(quote: $0.quote, kind: .rule, id: $0.id) }
      + items.filter(\.active).map { HelpedSign(quote: $0.quote, kind: .item, id: $0.id) }
    var seen = Set<String>()
    return all.filter { !$0.quote.isEmpty && seen.insert($0.quote).inserted }
  }

  /// The engine's quote normalisation (lower case, no punctuation, single spaces).
  static func normalize(_ s: String) -> String {
    (try? JSONText.decode(String.self, Engine.shared.call("normalizeForQuote", s))) ?? s.lowercased()
  }

  /// Same sign when one wording contains the other ("stop replying to messages" ⊂ "I also stop
  /// replying to messages").
  static func sameSign(_ a: String, _ b: String) -> Bool {
    let x = normalize(a), y = normalize(b)
    return x.count >= 3 && y.count >= 3 && (x.contains(y) || y.contains(x))
  }

  /// The first quoted message in a note (engine `quotedMessage`), else nil.
  static func quotedMessage(_ note: String) -> String? {
    (try? JSONText.decode(String?.self, Engine.shared.call("quotedMessage", note))) ?? nil
  }

  /// Task T without a model (engine `draftWithoutModel`): the saved message, else the message
  /// quoted in the note, else an empty draft for the user to write. Never invents text.
  static func draftWithoutModel(_ note: String, _ saved: String?) -> String {
    (try? JSONText.decode(String.self, Engine.shared.call("draftWithoutModel", note, saved.map { $0 as Any } ?? NSNull()))) ?? ""
  }

  /// "Draft that text" is offered when there is something to draft from.
  static func canDraft(text: String, message: String?, contactName: String?) -> Bool {
    !(message ?? "").isEmpty || quotedMessage(text) != nil || !(contactName ?? "").isEmpty
  }

  /// Task R's verified output → matches. Only ids that were sent survive (the router's
  /// `verifyTask` already checked this and the quotes; this is the second, local check, R8).
  static func matches(json: String?, signs: [HelpedSign], ids: [String]) -> [HelpedRecall.Match] {
    struct Out: Decodable { struct M: Decodable { let sign_id: String; let quote: String }; let matches: [M] }
    guard let json, let out = try? JSONText.decode(Out.self, json) else { return [] }
    var seen = Set<String>()
    return out.matches.compactMap { m in
      guard let i = ids.firstIndex(of: m.sign_id), i < signs.count, seen.insert(m.sign_id).inserted else { return nil }
      let q = m.quote.trimmingCharacters(in: .whitespacesAndNewlines)
      return q.isEmpty ? nil : HelpedRecall.Match(sign: signs[i], quote: q)
    }
  }

  /// "Save what helped" on Today, after a hard stretch ends: the last day is Steady again and
  /// some of the last 14 days were Changed. Returns the first changed day of that stretch, or
  /// nil when the prompt should not show (already answered, or a note saved since then).
  static func promptStart(records: [DayRecordValue], done: String?, userNoteDates: [String]) -> String? {
    guard let last = records.last, last.state == .MONITOR else { return nil }
    let hard = records.suffix(14).filter { $0.state == .ELEVATED || $0.state == .CONFIRMED }
    guard let startedOn = hard.first?.date else { return nil }
    if let done, done >= startedOn { return nil }
    if userNoteDates.contains(where: { $0 >= startedOn }) { return nil }
    return startedOn
  }

  /// "November 2026", as on the web.
  static func monthYear(_ day: String) -> String {
    guard let d = Clock.date(day) else { return day }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_GB")
    f.dateFormat = "LLLL yyyy"
    return f.string(from: d)
  }
}

extension Store {
  func helpedSigns() -> [HelpedSign] {
    Helped.signs(rules: all(PlanRule.self).compactMap(\.value), items: all(PersonalItem.self).compactMap(\.value))
  }

  /// Notes that are not archived, newest first.
  func helpedNotes() -> [HelpedNote] {
    all(HelpedNote.self).filter { !$0.archived }.sorted { $0.createdAt > $1.createdAt }
  }

  /// Notes for one sign, matched by its words.
  func helpedNotes(for signQuote: String) -> [HelpedNote] {
    helpedNotes().filter { Helped.sameSign($0.signQuote, signQuote) }
  }

  /// Saves a note when it has a sign and a sentence or a voice note. Returns false otherwise.
  @discardableResult
  func saveHelped(signQuote: String, text: String, audio: Data?, message: String?, contactName: String?, date: String = Clock.today) -> Bool {
    let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !signQuote.isEmpty, !t.isEmpty || audio != nil else { return false }
    let clean = { (s: String?) in s?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty }
    context.insert(HelpedNote(id: newId("helped"), signQuote: signQuote, text: t, audio: audio, message: clean(message), contactName: clean(contactName), createdAt: date))
    save()
    return true
  }

  func archiveHelped(id: String) {
    guard let n = first(HelpedNote.self, where: #Predicate { $0.id == id }) else { return }
    n.archived = true
    save()
  }
}

extension AppModel {
  /// Task R: which of the user's own signs their check-in text describes, matched by meaning
  /// on this device. Only signs that were sent, with a quote really in the text, survive (R8).
  /// Without a model: no match, and the user picks a sign themselves.
  func recallFromText(_ text: String) async -> HelpedRecall {
    let signs = store.helpedSigns()
    guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !signs.isEmpty else { return .none }
    let ids = signs.indices.map { "s\($0 + 1)" }
    let input: [String: Any] = ["text": text, "signs": zip(ids, signs).map { ["id": $0, "words": $1.quote] }]
    let res = await router.run("R", input: input, options: .init(sourceText: text, verify: ["signIds": ids]))
    guard res.ok else { return .none }
    return HelpedRecall(matches: Helped.matches(json: res.json, signs: signs, ids: ids), ranOn: res.ranOn)
  }

  /// Task T: a short text in the user's own voice, from their saved note, on this device.
  /// Without a model: their saved or quoted message. The user edits it and sends it themselves.
  func draftText(_ note: HelpedNote) async -> (message: String, ranOn: String) {
    let input: [String: Any] = ["text": note.text, "name": note.contactName ?? "", "saved_message": note.message ?? ""]
    let res = await router.run("T", input: input, options: .init(sourceText: note.text))
    if res.ok, let m = (JSONText.object(res.json ?? "") as? [String: Any])?["message"] as? String, !m.isEmpty { return (m, res.ranOn) }
    return (Helped.draftWithoutModel(note.text, note.message), "template")
  }

  /// Today's "Save what helped" prompt, or nil.
  var helpedPromptStart: String? {
    let user = store.all(HelpedNote.self).filter { $0.source == "user" }.map(\.createdAt)
    return Helped.promptStart(records: store.records().compactMap(\.value), done: settings.helpedPromptDone, userNoteDates: user)
  }

  /// Answers the prompt for this stretch (either way).
  func closeHelpedPrompt() {
    settings.helpedPromptDone = latestRecord?.date ?? Clock.today
    changed()
  }
}
