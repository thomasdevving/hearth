import SwiftUI

/// "Call a friend": one tap to call, or to open a ready message. Works offline, no model.
struct CallAFriendCard: View {
  @Environment(AppModel.self) private var app
  let people: [Person]
  var compact = false

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      SectionTitle(text: "Call a friend")
      if people.isEmpty {
        Muted("Add one to three people to reach out to on a hard day. Hearth never contacts them.")
        Button("Add someone") { app.path.append(.people) }.buttonStyle(.secondary)
      } else {
        if !compact { Muted("You choose who and when. Hearth never sends anything.") }
        ForEach(people, id: \.id) { p in
          HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
              Text(p.name.isEmpty ? p.phone : p.name).font(HearthFont.body(17, weight: "SemiBold"))
              if !p.goodFor.isEmpty { Text("Good for \(p.goodFor)").font(HearthFont.body(14)).foregroundStyle(Theme.muted) }
              if !compact && !p.message.isEmpty { Text("“\(p.message)”").font(HearthFont.body(14)).italic().foregroundStyle(Theme.ink2) }
            }
            Spacer(minLength: 8)
            if let tel = People.telURL(p) {
              Link(destination: tel) {
                Text("Call").font(HearthFont.body(16, weight: "SemiBold")).foregroundStyle(.white)
                  .padding(.horizontal, 16).frame(minHeight: 44).background(Capsule().fill(Theme.magenta))
              }
              .accessibilityLabel("Call \(p.name)")
            }
            if let sms = People.smsURL(p) {
              Link(destination: sms) {
                Text("Message").font(HearthFont.body(16, weight: "SemiBold")).foregroundStyle(Theme.magentaDeep)
                  .padding(.horizontal, 14).frame(minHeight: 44).overlay(Capsule().stroke(Theme.magentaLine, lineWidth: 2))
              }
              .accessibilityLabel("Message \(p.name)")
            }
          }
          .padding(12)
          .background(RoundedRectangle(cornerRadius: Theme.radius).fill(.white))
          .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line))
        }
        if !compact { Button("Edit my people ›") { app.path.append(.people) }.buttonStyle(.link) }
      }
    }
  }
}
