import Foundation

// "Too much today" (mirror of apps/web/src/app/smallerStep.ts): each action can have the
// user's own smaller version. The choice of a day is stored on this device so Hearth can say,
// by counting, which version was chosen last time. No model writes or picks the smaller step.

/// One day's choice for one action (`action_choices`).
struct ActionChoiceValue: Hashable {
  enum Choice: String { case full, smaller }
  var actionId: String
  var date: String
  var choice: Choice
}

enum SmallerStep {
  static let maxLength = 160

  /// Whitespace collapsed, trimmed, at most `maxLength` characters; nil when empty.
  static func clean(_ text: String) -> String? {
    let collapsed = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    let t = String(collapsed.prefix(maxLength))
    return t.isEmpty ? nil : t
  }

  struct Summary: Equatable {
    /// Today's choice, if any.
    var today: ActionChoiceValue.Choice?
    /// The most recent choice before today, if any.
    var last: ActionChoiceValue?
    /// How often each version was chosen before today.
    var full: Int
    var smaller: Int
  }

  static func summarize(_ choices: [ActionChoiceValue], actionId: String, today: String) -> Summary {
    let mine = choices.filter { $0.actionId == actionId }.sorted { $0.date < $1.date }
    let before = mine.filter { $0.date < today }
    return Summary(
      today: mine.first { $0.date == today }?.choice,
      last: before.last,
      full: before.filter { $0.choice == .full }.count,
      smaller: before.filter { $0.choice == .smaller }.count
    )
  }
}

extension Store {
  func actionChoices() -> [ActionChoiceValue] { all(ActionChoice.self).compactMap(\.value) }

  /// Saves (or, with empty text, removes) the user's own smaller step for an action.
  func setSmaller(actionId: String, text: String) {
    guard let row = first(PlanAction.self, where: #Predicate { $0.id == actionId }), var v = row.value else { return }
    v.smaller = SmallerStep.clean(text)
    row.json = JSONText.encode(v)
    save()
  }

  /// One choice per action per day: choosing again on the same day replaces it.
  func chooseVersion(actionId: String, date: String, choice: ActionChoiceValue.Choice) {
    let id = "\(actionId)_\(date)"
    if let row = first(ActionChoice.self, where: #Predicate { $0.id == id }) {
      row.choice = choice.rawValue
    } else {
      context.insert(ActionChoice(actionId: actionId, date: date, choice: choice.rawValue))
    }
    save()
  }

  /// "Watch for this too": a sign for a signal that moved first, in the user's own words
  /// (at least 3 characters; nothing is added without them). Returns false when not added.
  @discardableResult
  func watchToo(_ o: SignalOnsetValue, quote: String) -> Bool {
    let q = quote.trimmingCharacters(in: .whitespacesAndNewlines)
    guard q.count >= 3 else { return false }
    let parts = o.feature.split(separator: ":", maxSplits: 1).map(String.init)
    let id = newId("rule")
    let rule: [String: Any] = [
      "id": id, "feature": parts[0], "direction": o.direction ?? "higher",
      "placeId": parts.count > 1 ? parts[1] as Any : NSNull(), "quote": q, "active": true,
    ]
    context.insert(PlanRule(id: id, json: JSONText.encode(rule)))
    save()
    return true
  }
}
