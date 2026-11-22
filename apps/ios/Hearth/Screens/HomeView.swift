import SwiftUI

/// `home` (docs/01 §4): state badge, why, things for today, personal signals with sparklines,
/// and the user's own last months.
struct HomeView: View {
  @Environment(AppModel.self) private var app
  @State private var why = false

  var body: some View {
    let _ = app.revision
    let records = app.store.records().compactMap(\.value)
    let last = records.last
    let st = last?.state ?? app.engineState?.state ?? .WARM_UP
    let places = app.engineState?.places ?? []
    ScreenScroll(title: "Today") {
      if let p = app.progress {
        Card(tone: .accent) {
          Text("Learning your usual days…").font(HearthFont.body(16, weight: "SemiBold"))
          ProgressView(value: Double(p.done), total: Double(max(p.total, 1))).tint(Theme.magenta)
          Muted("\(p.done) of \(p.total) days")
        }
      } else if let s = app.status {
        Card(tone: .accent) { HStack { ProgressView(); Text(s) } }
      }

      stateBadge(st, last: last)

      activeContexts

      inbox

      if st == .ELEVATED || st == .CONFIRMED { CallAFriendCard(people: People.all(app.store), compact: true) }

      SectionTitle(text: "Your signals")
      let rules = app.store.activeRules()
      if rules.isEmpty {
        HStack(spacing: 4) {
          Muted("No personal signals yet.")
          Button("Set up your plan") { app.path.append(.planSetup(first: false)) }.buttonStyle(.link)
        }
      }
      ForEach(rules, id: \.id) { r in
        let f = Copy.ruleFeature(r)
        let values = records.suffix(28).map { $0.features.values[f] ?? nil }
        HStack(spacing: 12) {
          VStack(alignment: .leading, spacing: 2) {
            Text(Copy.feature(f, places: places)).font(HearthFont.body(16, weight: "SemiBold"))
            Text("“\(r.quote)”").font(HearthFont.body(14)).foregroundStyle(Theme.muted)
          }
          Spacer()
          Sparkline(values: values)
          Text(Copy.value(f, values.last ?? nil)).font(HearthFont.body(15, weight: "Medium")).frame(minWidth: 60, alignment: .trailing)
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
      }

      lastMonths(records)

      HStack {
        Button("See all trends ›") { app.selectedTab = .trends }.buttonStyle(.link)
        Spacer()
        Button("Weekly reflection ›") { app.path.append(.weekly) }.buttonStyle(.link)
      }
      extras
    }
  }

  @ViewBuilder private func stateBadge(_ st: EngineStateName, last: DayRecordValue?) -> some View {
    HStack(alignment: .top, spacing: 12) {
      Circle().fill(Theme.stateColor(st)).frame(width: 14, height: 14).padding(.top, 5).accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 6) {
        Text(Copy.stateLabel[st] ?? "").font(HearthFont.display(22)).foregroundStyle(Theme.stateColor(st))
        Text(Copy.stateText[st] ?? "").fixedSize(horizontal: false, vertical: true)
        if (st == .ELEVATED || st == .CONFIRMED), let last {
          Button(why ? "Hide" : "Why?") { why.toggle() }.buttonStyle(.link)
          if why {
            if last.contributors.isEmpty { Text("• A small change across several signals.") }
            ForEach(last.contributors, id: \.feature) { c in Text("• \(c.phrase)") }
          }
        }
        if let d = last?.date { Muted("Scored up to \(Clock.pretty(d)).") }
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(RoundedRectangle(cornerRadius: Theme.radius).fill(Theme.surface2))
    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line))
    .accessibilityElement(children: .contain)
  }

  @ViewBuilder private var activeContexts: some View {
    let today = Clock.today
    let active = app.store.all(ContextLabel.self).compactMap(\.value).filter { $0.confirmed && $0.start <= today && today <= $0.end }
    if !active.isEmpty {
      let text = active.map { "\(Copy.context[$0.type] ?? $0.type) until \(Clock.pretty($0.end))" }.joined(separator: " · ")
      Text(text + (active.contains { $0.kind == "explains_sensors" } ? " — the affected signals are set aside." : ""))
        .font(HearthFont.body(15)).foregroundStyle(Theme.magentaDeep)
    }
  }

  /// Steps per day over every scored day: the user's own last months.
  @ViewBuilder private func lastMonths(_ records: [DayRecordValue]) -> some View {
    let pts = records.compactMap { r -> DatedValue? in
      guard let v = r.features.values["steps"] ?? nil, let d = Clock.date(r.date) else { return nil }
      return DatedValue(date: d, value: v)
    }
    if pts.count >= 7 {
      SectionTitle(text: "Your last months")
      Muted("Steps per day, with the 7-day mean.")
      HistoryChart(points: pts, label: "Steps")
    }
  }

  /// Things for today: the engine's actions as cards (docs/DECISIONS.md, M4).
  @ViewBuilder var inbox: some View {
    let items = app.store.openInbox()
    if items.isEmpty {
      Muted("Nothing to do today.")
    } else {
      ForEach(items, id: \.id) { item in inboxCard(item) }
    }
  }

  @ViewBuilder private func inboxCard(_ item: InboxItem) -> some View {
    switch item.type {
    case "checkin":
      cardButton(.accent, "Check-in ready", "Three quick questions, about 20 seconds.") { app.path.append(.checkin(item.checkinId ?? "")) }
    case "questionnaire":
      cardButton(.accent, item.instrument == "PHQ2" ? "Two short questions" : "A short questionnaire (9 questions)", "About the last two weeks.") {
        app.path.append(.questionnaire(item.instrument ?? "PHQ2"))
      }
    case "context_confirm":
      let label = item.contextJSON.flatMap { try? JSONText.decode(ContextLabelValue.self, $0) }
      let title = (label?.type).flatMap { $0.isEmpty ? nil : "\(Copy.context[$0] ?? $0)?" } ?? "Is something changing your routine?"
      cardButton(.warm, title, "One tap to confirm. Nothing changes until you do.") { app.path.append(.contextConfirm(item.id)) }
    case "context_expired":
      cardButton(.warm, "Does your earlier note still apply?", "It ended yesterday. Tap to extend it or leave it.") { app.path.append(.contextConfirm(item.id)) }
    case "show_plan":
      cardButton(.warm, "Your plan", "You wrote down what helps. Have a look.") { app.selectedTab = .plan }
    default:
      EmptyView()
    }
  }

  private func cardButton(_ tone: Card<AnyView>.Tone, _ title: String, _ sub: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Card(tone: tone) {
        AnyView(VStack(alignment: .leading, spacing: 4) {
          Text(title).font(HearthFont.body(17, weight: "SemiBold"))
          Text(sub).foregroundStyle(Theme.ink2)
        })
      }
    }
    .buttonStyle(.plain)
  }

  @ViewBuilder var extras: some View {
    NoteBox()
    HelpButton()
  }
}

/// "Anything different this week?": free text at any time (DECISIONS M3), through crisis
/// keywords, task H and task B on the device.
struct NoteBox: View {
  @Environment(AppModel.self) private var app
  @State private var text = ""
  @State private var busy = false
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      TextArea(label: "Anything different this week?", text: $text, placeholder: "For example: visitors until Sunday", minHeight: 60)
      Button(busy ? "Saving…" : "Add note") {
        Task {
          busy = true
          await app.submitNote(text)
          text = ""
          busy = false
        }
      }
      .buttonStyle(.secondary)
      .disabled(busy || text.trimmed.isEmpty)
      Muted("Stays on this device. Read by the on-device model only.")
    }
    .padding(.top, 16)
  }
}
