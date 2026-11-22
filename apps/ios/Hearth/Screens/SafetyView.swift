import SwiftUI

/// `safety` (docs/06 §4). Bundled data and local records only: no network, no model call.
/// Shown full-screen; it cannot be swiped away, and Back becomes active only after the
/// support lines have been on screen for 3 seconds (R7).
struct SafetyView: View {
  @Environment(AppModel.self) private var app
  @State private var canLeave = false
  @State private var editing = false
  @State private var warningSigns = ""
  @State private var helps = ""
  @State private var whoToCall = ""
  var startEditing = false
  var onClose: () -> Void

  var body: some View {
    let _ = app.revision
    let lines = Shared.crisisLines
    let line = lines.countries[app.settings.country] ?? lines.default
    let plan = app.store.all(SafetyPlan.self).first
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text("It sounds like things are very hard right now. You don't have to handle this alone.")
          .font(HearthFont.display(26)).foregroundStyle(Theme.ink)
          .accessibilityAddTraits(.isHeader)

        VStack(alignment: .leading, spacing: 8) {
          Text(line.name).font(HearthFont.body(18, weight: "SemiBold"))
          if let phone = line.phone, let url = URL(string: "tel:\(phone.filter { !$0.isWhitespace })") {
            Link(destination: url) { callLabel("Call \(phone)") }
          } else if let url = URL(string: line.url) {
            Link(destination: url) { callLabel("Find a helpline") }
          }
          if let alt = line.alt_phone, let url = URL(string: "tel:\(alt.filter { $0.isNumber })") {
            HStack(spacing: 4) { Text("Or call"); Link(alt, destination: url).foregroundStyle(Theme.magenta) }
          }
          if let url = URL(string: line.url) { Link(line.url, destination: url).foregroundStyle(Theme.magenta) }
        }

        Group {
          if let e = line.emergency, let url = URL(string: "tel:\(e)") {
            HStack(spacing: 4) { Text("If you are in immediate danger, call"); Link(e, destination: url).foregroundStyle(Theme.danger); Text(".") }
          } else {
            Text(lines.emergency_text)
          }
        }
        .font(HearthFont.body(17, weight: "SemiBold"))

        let people = People.all(app.store)
        if !people.isEmpty { CallAFriendCard(people: people, compact: true) }

        SectionTitle(text: "My safety plan")
        if editing {
          TextArea(label: "My warning signs", text: $warningSigns, minHeight: 60)
          TextArea(label: "What helps me", text: $helps, minHeight: 60)
          TextArea(label: "Who I can call", text: $whoToCall, minHeight: 60)
          Button("Save on this device") {
            if let p = plan { p.warningSigns = warningSigns; p.helps = helps; p.whoToCall = whoToCall } else {
              app.store.context.insert(SafetyPlan(warningSigns: warningSigns, helps: helps, whoToCall: whoToCall))
            }
            app.changed()
            editing = false
          }
          .buttonStyle(.secondary)
        } else if let p = plan, !(p.warningSigns + p.helps + p.whoToCall).isEmpty {
          if !p.warningSigns.isEmpty { (Text("My warning signs: ").bold() + Text(p.warningSigns)) }
          if !p.helps.isEmpty { (Text("What helps me: ").bold() + Text(p.helps)) }
          if !p.whoToCall.isEmpty { (Text("Who I can call: ").bold() + Text(p.whoToCall)) }
          Button("Edit") { load(plan); editing = true }.buttonStyle(.link)
        } else {
          Button("Write your own safety plan") { load(plan); editing = true }.buttonStyle(.link)
        }

        Muted("Hearth is not a crisis service and has not contacted anyone.")
        Button(canLeave ? "Back" : "Back (in a moment)") { onClose() }
          .buttonStyle(.secondary)
          .disabled(!canLeave)
          .accessibilityLabel("Back")
      }
      .font(HearthFont.body(17))
      .foregroundStyle(Theme.ink)
      .padding(.horizontal, 20).padding(.vertical, 24)
    }
    .background(Color.white)
    .interactiveDismissDisabled(true)
    .task {
      if startEditing { load(plan); editing = true }
      try? await Task.sleep(for: .seconds(3))
      canLeave = true
    }
  }

  private func load(_ p: SafetyPlan?) {
    warningSigns = p?.warningSigns ?? ""; helps = p?.helps ?? ""; whoToCall = p?.whoToCall ?? ""
  }

  private func callLabel(_ s: String) -> some View {
    Text(s)
      .font(HearthFont.body(19, weight: "SemiBold"))
      .foregroundStyle(.white)
      .frame(maxWidth: .infinity, minHeight: 56)
      .background(RoundedRectangle(cornerRadius: 12).fill(Theme.danger))
  }
}
