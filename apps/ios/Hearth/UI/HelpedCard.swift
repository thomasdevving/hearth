import SwiftUI

/// A note the user saved about what helped them, brought back in their own words (web:
/// apps/web/src/ui/HelpedCard.tsx). "Draft that text" asks the model on this device (task T)
/// or falls back to the user's own saved or quoted message; the user edits it and sends it
/// from Messages themselves. Hearth never sends anything.
struct HelpedCardView: View {
  @Environment(AppModel.self) private var app
  @Environment(\.openURL) private var openURL
  let note: HelpedNote
  /// Set when the card answers a sign that came up (after a check-in).
  var signQuote: String? = nil
  var compact = false

  @State private var draft: Draft?
  @State private var busy = false

  struct Draft: Equatable { var message: String; var ranOn: String }

  #if DEBUG
  /// `-HearthAutoDraft YES` drafts the text when the card appears (for screenshots).
  private static var autoDraft: Bool { UserDefaults.standard.bool(forKey: "HearthAutoDraft") }
  #else
  private static let autoDraft = false
  #endif

  var body: some View {
    let canDraft = Helped.canDraft(text: note.text, message: note.message, contactName: note.contactName)
    VStack(alignment: .leading, spacing: 8) {
      Text(signQuote != nil ? "WHAT HELPED YOU LAST TIME" : "SAVED \(Helped.monthYear(note.createdAt).uppercased())")
        .font(HearthFont.body(12, weight: "SemiBold")).tracking(1).foregroundStyle(Theme.magentaDeep)
        .accessibilityLabel(signQuote != nil ? "What helped you last time" : "Saved \(Helped.monthYear(note.createdAt))")
      if !note.text.isEmpty {
        Text(note.text).font(HearthFont.display(18, bold: false)).foregroundStyle(Theme.ink)
          .fixedSize(horizontal: false, vertical: true)
      }
      if let signQuote {
        Text("Saved \(Helped.monthYear(note.createdAt)), for “\(signQuote)”").font(HearthFont.body(14)).foregroundStyle(Theme.muted)
      }
      if let audio = note.audio { VoiceNoteButton(data: audio) }
      if draft == nil && (canDraft || compact) {
        HStack(spacing: 14) {
          if canDraft {
            Button(busy ? "Writing on this device…" : "Draft that text") { Task { await makeDraft() } }
              .buttonStyle(.compact).disabled(busy)
          }
          if compact {
            Button("Archive") { app.store.archiveHelped(id: note.id); app.changed() }.buttonStyle(.link)
          }
        }
        .padding(.top, 4)
      }
      if let d = draft { draftView(d) }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(RoundedRectangle(cornerRadius: Theme.radius).fill(Color.white))
    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.magentaLine, lineWidth: compact ? 1 : 1.5))
    .task { if Self.autoDraft && canDraft && draft == nil { await makeDraft() } }
  }

  private func makeDraft() async {
    busy = true
    let d = await app.draftText(note)
    draft = Draft(message: d.message, ranOn: d.ranOn)
    busy = false
  }

  private func draftView(_ d: Draft) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Rectangle().fill(Theme.line).frame(height: 1).padding(.bottom, 4)
      HStack {
        Text(note.contactName.map { "To \($0)" } ?? "Your text").font(HearthFont.body(16, weight: "SemiBold"))
        Spacer()
        ModelBadge(ranOn: d.ranOn)
      }
      TextField("Your text", text: Binding(get: { draft?.message ?? "" }, set: { draft?.message = $0 }), axis: .vertical)
        .font(HearthFont.body(17))
        .lineLimit(2...6)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
        .accessibilityLabel(note.contactName.map { "Text to \($0)" } ?? "Your text")
      Button("Open in Messages") { if let url = Self.smsURL(d.message) { openURL(url) } }
        .buttonStyle(.primary)
        .disabled(d.message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      Text("Hearth never sends anything. You choose if and when.").font(HearthFont.body(14)).foregroundStyle(Theme.muted)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.top, 4)
  }

  /// Messages with the text filled in; the user picks the person and presses send.
  static func smsURL(_ message: String) -> URL? {
    let body = message.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-_.!~*'()"))) ?? ""
    return URL(string: "sms:&body=\(body)")
  }
}

/// After a check-in: if the text sounds like one of the user's own signs (task R, on this
/// device), ask, and on yes show what helped them last time. Without a match, the user can
/// pick a sign themselves (only when notes exist). Web: `RecallBlock` in Checkin.tsx.
struct HelpedRecallView: View {
  @Environment(AppModel.self) private var app
  let recall: HelpedRecall
  @State private var chosen: String?
  @State private var dismissed = false

  #if DEBUG
  /// `-HearthRecallYes YES` answers "Yes, that's it" (for screenshots).
  private static var autoYes: Bool { UserDefaults.standard.bool(forKey: "HearthRecallYes") }
  #else
  private static let autoYes = false
  #endif

  var body: some View {
    VStack(alignment: .leading, spacing: 12) { content }
      .onAppear { if Self.autoYes, let m = recall.matches.first { chosen = m.sign.quote } }
  }

  @ViewBuilder private var content: some View {
    let _ = app.revision
    let signs = app.store.helpedSigns()
    if let chosen {
      let notes = app.store.helpedNotes(for: chosen)
      if notes.isEmpty {
        Card(tone: .accent) {
          Text("Nothing saved for “\(chosen)” yet. When things are steadier, you can save what helped.")
            .fixedSize(horizontal: false, vertical: true)
          Button("Save what helped ›") { app.path.append(.helpedNew(chosen)) }.buttonStyle(.link)
        }
      } else {
        ForEach(notes, id: \.id) { HelpedCardView(note: $0, signQuote: chosen) }
      }
    } else if let match = recall.matches.first, !dismissed {
      Card(tone: .accent) {
        HStack(alignment: .firstTextBaseline) {
          Text("That sounds like one of your signs").font(HearthFont.body(17, weight: "SemiBold"))
          Spacer(minLength: 8)
          ModelBadge(ranOn: recall.ranOn == "none" ? "template" : recall.ranOn)
        }
        (Text("You wrote “\(match.quote)”. You once named this sign: ")
          + Text("“\(match.sign.quote)”").font(HearthFont.body(16, weight: "SemiBold"))
          + Text(". Is that right?"))
          .fixedSize(horizontal: false, vertical: true)
          .padding(.vertical, 4)
        HStack(spacing: 12) {
          Button("Yes, that's it") { chosen = match.sign.quote }.buttonStyle(.primary)
          Button("Not quite") { dismissed = true }.buttonStyle(.secondary)
        }
      }
    } else if signs.contains(where: { !app.store.helpedNotes(for: $0.quote).isEmpty }) {
      Card(tone: .accent) {
        Text("Do any of your signs feel true right now?").font(HearthFont.body(17, weight: "SemiBold"))
        FlowLayout { ForEach(signs, id: \.quote) { s in Chip(text: "“\(s.quote)”", selected: false) { chosen = s.quote } } }
          .padding(.top, 6)
      }
    }
  }
}

/// Today, after a hard stretch ends: anything that helped? Asked once per stretch (web:
/// `HelpedPrompt` in Home.tsx).
struct HelpedPromptCard: View {
  @Environment(AppModel.self) private var app
  var body: some View {
    let _ = app.revision
    if app.helpedPromptStart != nil {
      Card(tone: .accent) {
        (Text("Your days look steadier again.").font(HearthFont.body(16, weight: "SemiBold"))
          + Text(" Anything that helped? Save it in your own words, and Hearth brings it back next time."))
          .fixedSize(horizontal: false, vertical: true)
        HStack(spacing: 12) {
          Button("Save what helped") { app.closeHelpedPrompt(); app.path.append(.helpedNew(nil)) }.buttonStyle(.primary)
          Button("Not now") { app.closeHelpedPrompt() }.buttonStyle(.secondary)
        }
        .padding(.top, 8)
      }
    }
  }
}
