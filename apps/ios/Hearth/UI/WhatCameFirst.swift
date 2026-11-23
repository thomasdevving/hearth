import SwiftUI

/// What "What came first" shows: the engine's `signalOnset` (packages/engine/src/explain.ts)
/// over the stored day records and the active rules. Swift only picks which ones to show.
struct OnsetData {
  /// How many signals outside the plan to show: the earliest ones are the interesting ones.
  static let othersShown = 3

  let result: OnsetResultValue

  /// The user's own signs that moved, and the earliest few others, in the order they moved.
  var shown: [SignalOnsetValue] {
    let own = result.moved.filter { $0.ruleId != nil }
    let others = result.moved.filter { $0.ruleId == nil }.prefix(Self.othersShown)
    // Stable: equal dates keep the engine's order.
    return (own + others).enumerated().sorted { a, b in
      let x = a.element.firstDate ?? "", y = b.element.firstDate ?? ""
      return x != y ? x < y : a.offset < b.offset
    }.map(\.element)
  }

  /// nil when there is no stretch to look back on.
  @MainActor
  static func load(store: Store) throws -> OnsetData? {
    let records = store.records().map { RawJSON($0.json) }
    guard !records.isEmpty else { return nil }
    let rules = store.all(PlanRule.self).filter { $0.value?.active == true }.map { RawJSON($0.json) }
    let out = try Engine.shared.call("signalOnset", records, rules, Shared.config)
    if out == "null" { return nil }
    return OnsetData(result: try JSONText.decode(OnsetResultValue.self, out))
  }

  /// "3 days before Hearth noticed", as on the web.
  static func when(_ o: SignalOnsetValue) -> String {
    let n = o.daysBefore ?? 0
    if n > 1 { return "\(n) days before Hearth noticed" }
    if n == 1 { return "the day before Hearth noticed" }
    if n == 0 { return "the day Hearth noticed" }
    return n == -1 ? "a day after" : "\(-n) days after"
  }
}

/// The plan learns from a hard stretch: which signals moved first, and how long before Hearth
/// noticed. Counted by the engine; no model is involved. The user decides whether to watch an
/// extra signal, in their own words. In a `Fold` on the plan (web: WhatCameFirst.tsx).
struct WhatCameFirstFold: View {
  @Environment(AppModel.self) private var app
  @State private var data: OnsetData?
  @State private var adding: String?
  @State private var quote = ""

  #if DEBUG
  /// `-HearthFoldsOpen YES` starts with this fold open (for screenshots).
  private static var startsOpen: Bool { UserDefaults.standard.bool(forKey: "HearthFoldsOpen") }
  #else
  private static let startsOpen = false
  #endif

  var body: some View {
    // A VStack, not a Group: an empty Group is no view, and its task would never run.
    VStack(alignment: .leading, spacing: 0) {
      if let data, !(data.shown.isEmpty && data.result.unchanged.isEmpty) {
        Fold(title: "What came first", hint: "\(data.shown.count) signals, in order", startsOpen: Self.startsOpen) { content(data) }
      } else {
        Color.clear.frame(height: 0)
      }
    }
    .task(id: app.revision) { data = try? OnsetData.load(store: app.store) }
  }

  @ViewBuilder private func content(_ d: OnsetData) -> some View {
    let places = app.engineState?.places ?? []
    let rules = Dictionary(app.store.all(PlanRule.self).compactMap(\.value).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    let e = d.result.episode
    Muted(e.end.map { "Your last hard stretch, \(Clock.pretty(e.start)) to \(Clock.pretty($0)). This is the order in which your signals moved:" }
      ?? "Hearth noticed a change on \(Clock.pretty(e.start)). This is the order in which your signals moved:")
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(d.shown.enumerated()), id: \.element.feature) { i, o in
        row(i + 1, o, rule: o.ruleId.flatMap { rules[$0] }, places: places)
          .overlay(alignment: .top) { if i > 0 { Rectangle().fill(Theme.line).frame(height: 1) } }
      }
    }
    .background(RoundedRectangle(cornerRadius: Theme.radius).fill(Color.white))
    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line))
    if !d.result.unchanged.isEmpty {
      Muted("Did not change this time: \(d.result.unchanged.map { Copy.feature($0.feature, places: places).lowercased() }.joined(separator: ", ")). That is fine.")
    }
    Muted("Worked out by Hearth's code, not a model. Watch the first signs most closely.")
  }

  private func row(_ n: Int, _ o: SignalOnsetValue, rule: PlanRuleValue?, places: [Place]) -> some View {
    let label = "\(Copy.feature(o.feature, places: places)) \(o.direction.map { Copy.direction(o.feature, $0) } ?? "")".trimmingCharacters(in: .whitespaces)
    return HStack(alignment: .top, spacing: 12) {
      Text("\(n)")
        .font(HearthFont.body(13, weight: "Bold"))
        .foregroundStyle(rule != nil ? Theme.magentaDeep : Theme.ink2)
        .frame(width: 24, height: 24)
        .background(Circle().fill(rule != nil ? Theme.magentaTint : Theme.surface2))
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(label).font(HearthFont.body(16, weight: "SemiBold")).fixedSize(horizontal: false, vertical: true)
          Spacer(minLength: 0)
          Button("See it ›") { app.path.append(.why(o.feature)) }
            .buttonStyle(.bare).font(HearthFont.body(14, weight: "Medium")).foregroundStyle(Theme.magenta)
            .accessibilityLabel("See \(label)")
        }
        Text(OnsetData.when(o)).font(HearthFont.body(14, weight: "SemiBold")).foregroundStyle(Theme.changed)
        if let rule {
          Text("Your sign: “\(rule.quote)”").font(HearthFont.body(14)).italic().foregroundStyle(Theme.ink2)
        } else if adding == o.feature {
          addSign(o)
        } else {
          HStack(spacing: 6) {
            Text("Not in your plan.").font(HearthFont.body(14)).foregroundStyle(Theme.muted)
            Button("Watch for this too") { quote = ""; adding = o.feature }
              .buttonStyle(.bare).font(HearthFont.body(14, weight: "Medium")).foregroundStyle(Theme.magenta)
          }
        }
      }
    }
    .padding(.horizontal, 14).padding(.vertical, 12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
  }

  /// A new sign only with the user's own words (as on the web).
  private func addSign(_ o: SignalOnsetValue) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("In your own words").font(HearthFont.body(14)).foregroundStyle(Theme.ink2)
      TextField("“My heart beats faster at rest”", text: $quote)
        .font(HearthFont.body(16))
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
        .accessibilityLabel("In your own words")
      HStack(spacing: 12) {
        Button("Add to my signs") {
          if app.store.watchToo(o, quote: quote) { adding = nil; quote = ""; app.changed() }
        }
        .buttonStyle(.compact).disabled(quote.trimmingCharacters(in: .whitespacesAndNewlines).count < 3)
        Button("Cancel") { adding = nil }.buttonStyle(.link)
      }
    }
  }
}
