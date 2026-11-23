import SwiftUI

/// One action from the user's plan, with their own smaller version for a day when it is too
/// much (web: apps/web/src/ui/ActionItem.tsx). Everything here is the user's text; Hearth only
/// remembers which version they chose (counted by code) and says so plainly.
struct ActionItemView: View {
  @Environment(AppModel.self) private var app
  let action: PlanActionValue
  let choices: [ActionChoiceValue]
  let today: String
  var showQuote = true
  /// In "For today" the action is the headline.
  var large = false

  @State private var tooMuch = false
  @State private var editing: Bool
  @State private var draft = ""
  @FocusState private var focused: Bool

  init(action: PlanActionValue, choices: [ActionChoiceValue], today: String, showQuote: Bool = true, large: Bool = false) {
    self.action = action; self.choices = choices; self.today = today; self.showQuote = showQuote; self.large = large
    _editing = State(initialValue: Self.startEditing && action.smaller == nil)
  }

  #if DEBUG
  /// `-HearthEditSmaller YES` opens "Make it smaller" on actions without one (for screenshots).
  private static var startEditing: Bool { UserDefaults.standard.bool(forKey: "HearthEditSmaller") }
  #else
  private static let startEditing = false
  #endif

  var body: some View {
    let s = SmallerStep.summarize(choices, actionId: action.id, today: today)
    let smaller = action.smaller
    let showSmaller = smaller != nil && (tooMuch || s.today == .smaller)
    VStack(alignment: .leading, spacing: 8) {
      VStack(alignment: .leading, spacing: 2) {
        Text(action.text)
          .font(large ? HearthFont.display(20) : HearthFont.body(17, weight: "SemiBold"))
          .fixedSize(horizontal: false, vertical: true)
        if showQuote, !action.quote.isEmpty {
          Text("“\(action.quote)”").font(HearthFont.body(14)).italic().foregroundStyle(Theme.ink2)
        }
        if let last = s.last {
          Text("Last time (\(Clock.pretty(last.date))) you chose \(last.choice == .smaller ? "the smaller step" : "this").")
            .font(HearthFont.body(14)).foregroundStyle(Theme.ink2)
        }
      }

      if s.today == .full { chosen }

      if showSmaller, let smaller {
        VStack(alignment: .leading, spacing: 6) {
          Text("A SMALLER STEP").font(HearthFont.body(12, weight: "SemiBold")).tracking(1).foregroundStyle(Theme.muted)
          Text(smaller).font(HearthFont.body(16, weight: "SemiBold")).fixedSize(horizontal: false, vertical: true)
          if s.today == .smaller { chosen } else {
            Button("I'll do this instead") { choose(.smaller) }.buttonStyle(.compact)
          }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("A smaller step")
      }

      if editing {
        editor
      } else if s.today == nil {
        HStack(spacing: 14) {
          Button("I'll do this") { choose(.full) }.buttonStyle(.compact)
          if smaller != nil {
            if !tooMuch { Button("Too much today?") { tooMuch = true }.buttonStyle(.link) }
          } else {
            Button("Make it smaller") { draft = ""; editing = true }.buttonStyle(.link)
          }
        }
      }
      if smaller != nil && !editing {
        Button("Change the smaller step") { draft = smaller ?? ""; editing = true }
          .buttonStyle(.plain).font(HearthFont.body(14, weight: "Medium")).foregroundStyle(Theme.magenta)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var chosen: some View {
    Text("Chosen for today ✓").font(HearthFont.body(15, weight: "SemiBold")).foregroundStyle(Theme.steady)
  }

  private var editor: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("If this is too much, I will…").font(HearthFont.body(15)).foregroundStyle(Theme.ink2)
      TextField("Only text: “Ten minutes tonight?”", text: $draft)
        .font(HearthFont.body(16))
        .focused($focused)
        .submitLabel(.done)
        .onSubmit(save)
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.white))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
        .accessibilityLabel("If this is too much, I will…")
        .onChange(of: draft) { _, v in if v.count > SmallerStep.maxLength { draft = String(v.prefix(SmallerStep.maxLength)) } }
      HStack(spacing: 14) {
        Button("Save", action: save).buttonStyle(.compact)
        Button("Cancel") { editing = false }.buttonStyle(.link)
      }
    }
    .onAppear { if !Self.startEditing { focused = true } }
  }

  private func save() {
    app.store.setSmaller(actionId: action.id, text: draft)
    editing = false
    app.changed()
  }

  private func choose(_ c: ActionChoiceValue.Choice) {
    app.store.chooseVersion(actionId: action.id, date: today, choice: c)
    app.changed()
  }
}
