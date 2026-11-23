import SwiftUI

/// "Ask about your data" on Trends (web: screens/Ask.tsx). Hidden without a model on this
/// device (docs/05 §3).
struct AskSection: View {
  @Environment(AppModel.self) private var app
  @State private var question = ""
  @State private var answer: AskAnswer?
  @State private var busy = false

  #if DEBUG
  /// `-HearthAsk "<question>"` asks that question on appear (for screenshots).
  private static var autoAsk: String? { UserDefaults.standard.string(forKey: "HearthAsk") }
  #else
  private static let autoAsk: String? = nil
  #endif

  var body: some View {
    if app.askAvailable {
      VStack(alignment: .leading, spacing: 10) {
        SectionTitle(text: "Ask about your data")
        TextField(Ask.placeholder, text: $question, axis: .vertical)
          .font(HearthFont.body(16))
          .lineLimit(1...4)
          .padding(12)
          .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))
          .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
          .accessibilityLabel("Your question")
          .submitLabel(.search)
          .onSubmit { Task { await ask() } }
        HStack(spacing: 10) {
          Button(busy ? "Looking…" : "Ask") { Task { await ask() } }
            .buttonStyle(.compact)
            .disabled(busy || question.trimmed.isEmpty)
          MicButton(label: "Ask by voice") { question = $0 }
        }
        if let answer {
          VStack(alignment: .leading, spacing: 6) {
            Text(answer.text).fixedSize(horizontal: false, vertical: true)
            ModelBadge(ranOn: answer.ranOn)
          }
          .accessibilityElement(children: .combine)
        }
        Muted("About your own signals and check-ins. Read on this device.")
      }
      .task {
        guard let q = Self.autoAsk, answer == nil, !busy else { return }
        // Wait for the demo days to be scored first.
        for _ in 0..<60 where app.progress != nil || app.store.records().count < 60 { try? await Task.sleep(for: .milliseconds(500)) }
        question = q
        await ask()
      }
    }
  }

  private func ask() async {
    guard !busy, !question.trimmed.isEmpty else { return }
    busy = true
    answer = nil
    answer = await app.ask(question)
    busy = false
  }
}
