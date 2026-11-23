import SwiftUI

/// `helped_new`: save what helped, in one sentence and/or a short voice note, for one of your
/// signs (web: HelpedNew.tsx). Stored on this device only (S3); no model is involved.
struct HelpedNewView: View {
  @Environment(AppModel.self) private var app
  /// The sign to start with, by its words (nil: the first sign).
  let sign: String?

  @State private var chosen = ""
  @State private var text = ""
  @State private var message = ""
  @State private var contact = ""
  @State private var recorder = VoiceRecorder()
  @State private var loaded = false

  var body: some View {
    let signs = app.store.helpedSigns()
    let audio = recorder.data
    let ok = !chosen.isEmpty && (!text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || audio != nil)
    ScreenScroll(title: "What helped") {
      Muted("Next time this sign comes up, Hearth shows it to you. It stays on this device.")

      VStack(alignment: .leading, spacing: 6) {
        Text("For which sign?").font(HearthFont.body(16, weight: "SemiBold"))
        Menu {
          Picker("Sign", selection: $chosen) {
            ForEach(signs, id: \.quote) { s in Text("“\(s.quote)”").tag(s.quote) }
          }
        } label: {
          HStack {
            Text(chosen.isEmpty ? "No signs in your plan yet" : "“\(chosen)”")
              .font(HearthFont.body(16)).foregroundStyle(chosen.isEmpty ? Theme.muted : Theme.ink)
              .multilineTextAlignment(.leading)
            Spacer(minLength: 8)
            Image(systemName: "chevron.up.chevron.down").font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.magenta)
          }
          .padding(12)
          .frame(minHeight: 48)
          .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))
          .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
        }
        .disabled(signs.isEmpty)
        .accessibilityLabel("Sign")
        .accessibilityValue(chosen)
      }
      .padding(.top, 4)

      TextArea(label: "What helped?", text: $text, placeholder: "For example: Calling felt like too much. I texted Maya “walk tomorrow?” and that was easier.")

      HStack(spacing: 12) {
        if let left = recorder.secondsLeft {
          Button { recorder.stop() } label: { Label("Stop (\(left) s)", systemImage: "stop.fill") }
            .buttonStyle(.compact)
            .accessibilityLabel("Stop recording, \(left) seconds left")
        } else {
          Button { Task { await recorder.start() } } label: {
            Label(audio == nil ? "Record a voice note" : "Record again", systemImage: "mic")
          }
          .buttonStyle(.compact)
        }
        if let audio, !recorder.recording { VoiceNoteButton(data: audio) }
      }
      if recorder.failed { Muted("The microphone is not available. You can save the text only.") }

      Fold(title: "A text you could send (optional)", startsOpen: Self.foldOpen) {
        field("To", text: $contact, placeholder: "Maya")
        field("Message", text: $message, placeholder: "Walk tomorrow?")
      }
      .padding(.top, 4)

      HStack(spacing: 12) {
        Button("Save") {
          if app.store.saveHelped(signQuote: chosen, text: text, audio: audio, message: message, contactName: contact) { toPlan() }
        }
        .buttonStyle(.primary).disabled(!ok || recorder.recording)
        Button("Cancel") { toPlan() }.buttonStyle(.secondary)
      }
      .padding(.top, 8)
    }
    .onAppear {
      guard !loaded else { return }
      loaded = true
      chosen = sign ?? signs.first?.quote ?? ""
      contact = People.all(app.store).first?.name ?? ""
    }
    .onDisappear { if recorder.recording { recorder.stop() } }
  }

  #if DEBUG
  /// `-HearthFoldsOpen YES` also opens the optional text here (for screenshots).
  private static var foldOpen: Bool { UserDefaults.standard.bool(forKey: "HearthFoldsOpen") }
  #else
  private static let foldOpen = false
  #endif

  /// Back to the plan, as on the web.
  private func toPlan() {
    app.path.removeAll()
    app.selectedTab = .plan
    app.changed()
  }

  private func field(_ label: String, text: Binding<String>, placeholder: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label).font(HearthFont.body(15)).foregroundStyle(Theme.ink2)
      TextField(placeholder, text: text)
        .font(HearthFont.body(16))
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
        .accessibilityLabel(label)
    }
  }
}
