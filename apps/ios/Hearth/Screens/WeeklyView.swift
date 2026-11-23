import SwiftUI

/// `weekly` (web: screens/Weekly.tsx): the weekly reflection (task D), the note in your own
/// voice (task P) and your weeks. With cloud consent, the exact text for Gemini is shown first
/// and nothing is sent until the user agrees.
struct WeeklyView: View {
  @Environment(AppModel.self) private var app
  @State private var ref: WeeklyReflection?
  @State private var busy = false
  /// The exact cloud payload waiting for the user's yes.
  @State private var preview: String?
  @State private var keptOnDevice = false

  var body: some View {
    let _ = app.revision
    let weeks = app.weekAggregates
    Group {
      if let preview {
        previewView(preview, weeks: weeks.count)
      } else {
        ScreenScroll(title: "Weekly reflection", badge: ref?.ranOn, anchor: WhyView.debugAnchor) {
          if weeks.isEmpty { Muted("No finished week yet.") }
          if !app.settings.cloudConsent {
            Muted(CloudModel.isConfigured ? "Allow the cloud model in Settings for a longer reflection by Gemini." : "A short summary, written on this device.")
          }
          if let ref {
            if ref.variant == "lite" {
              Muted(keptOnDevice ? "Short version, written on this device." : "Short version, written on this device (you are offline or the cloud was not reachable).")
            }
            Text(ref.reflection).fixedSize(horizontal: false, vertical: true)
            Text(ref.question).italic().fixedSize(horizontal: false, vertical: true)
          } else if !weeks.isEmpty {
            Muted("Writing…")
          }
          if !weeks.isEmpty {
            Button(busy ? "Writing…" : "Write it again") { Task { await start() } }
              .buttonStyle(.secondary).disabled(busy)
          }
          if let last = weeks.last { WeekNoteSection(isoWeek: last.isoWeek, existing: last.note) }
          if !weeks.isEmpty { weekTable(weeks) }
        }
      }
    }
    // Written when the latest finished week is there (and again when a new week arrives).
    .task(id: weeks.last?.isoWeek) {
      if !weeks.isEmpty && preview == nil && !busy { await start() }
    }
  }

  /// Shows the cloud payload first when the reflection would go to the cloud; else writes it.
  private func start() async {
    if let p = app.weeklyCloudPayload() { preview = p; return }
    await write(approved: nil, allowCloud: true)
  }

  private func write(approved: String?, allowCloud: Bool) async {
    busy = true
    keptOnDevice = !allowCloud
    ref = await app.writeReflection(approved: approved, allowCloud: allowCloud)
    busy = false
  }

  private func previewView(_ payload: String, weeks: Int) -> some View {
    ScreenScroll(title: "What would be shared") {
      Text("Exactly what would go to Gemini in the cloud to write your reflection: your weekly numbers in plain words, and a note only if you added one. No other notes, places, names or exact dates.")
        .fixedSize(horizontal: false, vertical: true)
      Muted("\(weeks == 1 ? "1 week" : "\(min(weeks, Weekly.weeksUsed)) weeks"), with the instructions for the model first.")
      ScrollView {
        Text(payload)
          .font(.system(size: 12, design: .monospaced))
          .foregroundStyle(Theme.ink2)
          .fixedSize(horizontal: false, vertical: true)
          .textSelection(.enabled)
          .padding(.vertical, 10)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .frame(height: 320)
      .accessibilityLabel("The exact text that would be sent")
      .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
      Muted("This request will be in the privacy ledger with exactly this text. You can turn the cloud model off in Settings at any time.")
      VStack(spacing: 10) {
        Button("Send to Gemini") { preview = nil; Task { await write(approved: payload, allowCloud: true) } }
          .buttonStyle(.primary)
        Button("Write it on this device instead") { preview = nil; Task { await write(approved: nil, allowCloud: false) } }
          .buttonStyle(.secondary)
      }
      .padding(.top, 4)
    }
  }

  private func weekTable(_ weeks: [WeekAggregateValue]) -> some View {
    let num = { (v: Double?) in v.map(JSONText.number) ?? "–" }
    return VStack(alignment: .leading, spacing: 8) {
      SectionTitle(text: "Your weeks")
      Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
        GridRow {
          ForEach(["Week of", "Index", "Changed days", "Check-ins", "PHQ-9"], id: \.self) { h in
            Text(h).font(HearthFont.body(13, weight: "SemiBold")).foregroundStyle(Theme.ink2)
          }
        }
        Divider().gridCellColumns(5)
        ForEach(weeks.reversed(), id: \.isoWeek) { w in
          GridRow {
            Text(Weekly.weekLabel(w.isoWeek).replacingOccurrences(of: "the week of ", with: ""))
            Text(num(w.indexMean))
            Text("\(w.daysElevated)")
            Text("\(w.ema.n)")
            Text(w.phq9.map(String.init) ?? "–")
          }
          .font(HearthFont.body(15))
        }
      }
    }
  }
}

/// "A note in your own voice" (web: screens/WeekNote.tsx, task P). The week's own texts stay
/// on this device; the on-device model suggests a general note, code checks it, and the user
/// edits it or leaves it out before it can be part of the summary.
struct WeekNoteSection: View {
  @Environment(AppModel.self) private var app
  let isoWeek: String
  let existing: WeekAggregateValue.Note?
  @State private var draft: (themes: [String], text: String, ranOn: String)?
  @State private var state: Phase = .idle
  @State private var problem: String?

  enum Phase { case idle, working, noModel, noText }

  #if DEBUG
  /// `-HearthWeekNote YES` asks for a suggestion on appear (for screenshots).
  private static var autoSuggest: Bool { UserDefaults.standard.bool(forKey: "HearthWeekNote") }
  #else
  private static let autoSuggest = false
  #endif

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      SectionTitle(text: "A note in your own voice for \(Weekly.weekLabel(isoWeek))")
      if let existing, draft == nil {
        Text("“\(existing.text)”").foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
        Button("Remove this note from the summary") { app.setWeekNote(isoWeek, text: nil) }.buttonStyle(.link)
      }
      if existing == nil && draft == nil {
        Muted("Your notes stay on this device. The on-device model can suggest a short note for your weekly summary; you see it first.")
        Button(state == .working ? "Writing on this device…" : "Suggest a note") { Task { await suggest() } }
          .buttonStyle(.secondary).disabled(state == .working)
        if state == .noModel { Muted("That needs the on-device model. No note is shared.") }
        if state == .noText { Muted("You wrote no notes this week.") }
      }
      if let d = draft {
        ModelBadge(ranOn: d.ranOn)
        TextArea(label: "This exact text would be added to the summary:", text: Binding(
          get: { draft?.text ?? "" },
          set: { draft?.text = String($0.prefix(200)) }))
        if let problem { Text(problem).font(HearthFont.body(15)).foregroundStyle(Theme.danger).fixedSize(horizontal: false, vertical: true) }
        VStack(spacing: 10) {
          Button("Add to my summary") {
            if app.setWeekNote(isoWeek, themes: d.themes, text: d.text) { draft = nil; problem = nil } else {
              problem = "Please remove names, numbers, places or other details that could identify someone."
            }
          }
          .buttonStyle(.primary).disabled(d.text.trimmed.isEmpty)
          Button("Don't add") { draft = nil; problem = nil }.buttonStyle(.secondary)
        }
      }
    }
    .task(id: isoWeek) {
      if Self.autoSuggest && existing == nil && draft == nil && state == .idle { await suggest() }
    }
  }

  private func suggest() async {
    state = .working
    switch await app.suggestWeekNote(isoWeek) {
    case .draft(let themes, let text, let ranOn): draft = (themes, text, ranOn); state = .idle
    case .noText: state = .noText
    case .noModel: state = .noModel
    }
  }
}
