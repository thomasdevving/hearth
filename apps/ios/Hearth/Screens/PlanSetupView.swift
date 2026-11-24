import SwiftUI

/// `plan_setup` (task G, docs/05 §4). The user's words go to the on-device model only (S3);
/// the engine's `verifyPlan` drops anything not in their own words; the user keeps or
/// unticks each line. Without the model: a form (docs/05 §3).
struct PlanSetupView: View {
  @Environment(AppModel.self) private var app
  let first: Bool

  enum Mode { case write, working, cards(VerifiedPlan, String), fallback }
  @State private var mode: Mode = .write
  @State private var warning = ""
  @State private var helps = ""
  @State private var picked: Set<String> = []
  @State private var keepRules: [Bool] = []
  @State private var keepItems: [Bool] = []
  @State private var keepActions: [Bool] = []
  @State private var places: [Int: (lat: Double, lon: Double)] = [:]
  @State private var placeNames: [Int: String] = [:]
  @State private var manualPlaces: [Bool] = Copy.placeSigns.map { _ in false }
  @State private var manualItems = ""
  @State private var manualActions = ""
  @State private var loaded = false

  var body: some View {
    Group {
      switch mode {
      case .write, .working: writeView
      case .cards(let plan, let ranOn): cardsView(plan, ranOn: ranOn)
      case .fallback: fallbackView
      }
    }
    .onAppear {
      guard !loaded else { return }
      loaded = true
      if let src = app.store.all(PlanSource.self).first { warning = src.warning; helps = src.helps }
      #if DEBUG
      // Screenshots: Sam's words typed in, and optionally "Turn into my plan" pressed.
      if UserDefaults.standard.bool(forKey: "HearthPlanPrefill") { warning = DemoData.samWarning; helps = DemoData.samHelps }
      if UserDefaults.standard.bool(forKey: "HearthAutoCards") { Task { try? await Task.sleep(for: .seconds(1)); await makeCards() } }
      #endif
    }
  }

  // Writing ---------------------------------------------------------------------------------

  private var writeView: some View {
    ScreenScroll(title: "Your plan", anchor: WhyView.debugAnchor) {
      Muted("Your own signs make Hearth sharper.")
      TextArea(label: "When things start to slip, what do you, or the people close to you, notice first?", text: $warning, placeholder: "For example: I go to bed later and stop going to the gym…", minHeight: 110)
      MicButton { t in warning = warning.isEmpty ? t : "\(warning) \(t)" }
      Text("Signs many people notice early").font(HearthFont.body(16, weight: "SemiBold")).padding(.top, 12)
        .accessibilityAddTraits(.isHeader)
      Muted("Tick any that fit you.")
      SuggestionPicker(picked: $picked)
      TextArea(label: "What helps when that happens?", text: $helps, placeholder: "For example: calling my sister…")
      MicButton { t in helps = helps.isEmpty ? t : "\(helps) \(t)" }
      ScanPlanButton { t in warning = warning.isEmpty ? t : "\(warning)\n\(t)" }
      let working: Bool = { if case .working = mode { return true } else { return false } }()
      let empty = warning.trimmed.isEmpty && helps.trimmed.isEmpty && picked.isEmpty
      Button(working ? "Reading on this device…" : "Turn into my plan") { Task { await makeCards() } }
        .buttonStyle(.primary)
        .disabled(working || empty)
      Muted(empty ? "Write your signs or tick one above first." : "The model on this iPhone turns your words into cards. You check each one.")
      Divider().padding(.top, 8)
      // One sentence with two inline links, so the words and links share a baseline and wrap together.
      Text("Not sure yet? [Skip for now](hearth-setup://skip) or [fill it in by hand](hearth-setup://hand)")
        .font(HearthFont.body(16)).foregroundStyle(Theme.ink2).tint(Theme.magentaDeep)
        .fixedSize(horizontal: false, vertical: true)
        .environment(\.openURL, OpenURLAction { url in
          if url.host == "skip" { save(.empty, rules: [], items: [], actions: []) } else { mode = .fallback }
          return .handled
        })
    }
  }

  private func makeCards() async {
    let text = [warning.trimmed, helps.trimmed].filter { !$0.isEmpty }.joined(separator: "\n")
    let ticked = suggestionPlan()
    if text.isEmpty { if !picked.isEmpty { show(ticked, ranOn: "template") }; return }
    if (try? Engine.shared.call("detectCrisis", text)) == "true" { app.openSafety("keyword"); return }
    mode = .working
    let res = await app.router.run("G", input: ["text": text], options: .init(sourceText: text, verify: ["sourceText": text]))
    if res.ok, let plan = res.decode(VerifiedPlan.self) {
      show(merge(plan, ticked), ranOn: res.ranOn)
    } else {
      mode = .fallback
    }
  }

  private func suggestionPlan() -> VerifiedPlan {
    VerifiedPlan(
      rules: Copy.suggestedSigns.filter { picked.contains($0.id) }.map { VerifiedRule(feature: $0.feature, direction: $0.direction, place_label: nil, quote: $0.text) },
      personal_checkin_items: Copy.suggestedItems.filter { picked.contains($0.id) }.map { VerifiedItem(question: $0.question, quote: $0.text) },
      actions: [], dropped: 0, valid: true)
  }

  /// The model's cards plus ticked suggestions; a feature or question already found is not repeated.
  private func merge(_ a: VerifiedPlan, _ b: VerifiedPlan) -> VerifiedPlan {
    var out = a
    for r in b.rules where !out.rules.contains(where: { $0.feature == r.feature }) { out.rules.append(r) }
    for it in b.personal_checkin_items where !out.personal_checkin_items.contains(where: { $0.question.lowercased() == it.question.lowercased() }) {
      out.personal_checkin_items.append(it)
    }
    return out
  }

  private func show(_ plan: VerifiedPlan, ranOn: String) {
    keepRules = plan.rules.map { _ in true }
    keepItems = plan.personal_checkin_items.map { _ in true }
    keepActions = plan.actions.map { _ in true }
    mode = .cards(plan, ranOn)
  }

  // Cards: the plan as one list with a tick per line --------------------------------------

  private func cardsView(_ plan: VerifiedPlan, ranOn: String) -> some View {
    ScreenScroll(title: "Your plan as cards", badge: ranOn) {
      Muted("Each card shows where it came from. Untick anything that is not right.")
      if plan.dropped > 0 {
        Text("Hearth left out \(plan.dropped == 1 ? "1 suggestion" : "\(plan.dropped) suggestions") from the model that \(plan.dropped == 1 ? "was" : "were") not in your own words.")
          .font(HearthFont.body(14)).foregroundStyle(Theme.magentaDeep)
      }
      if !plan.rules.isEmpty { SectionTitle(text: "Signs Hearth can watch") }
      ForEach(Array(plan.rules.enumerated()), id: \.offset) { i, r in
        let title = "\(r.feature == "place_visits" ? "Visits to the \(r.place_label ?? "place")" : Copy.feature(r.feature)) \(Copy.direction(r.feature, r.direction))"
        PlanLine(title: title, kept: $keepRules[i]) {
          Origin(quote: r.quote)
          if r.feature == "place_visits" { placePicker(i, label: r.place_label ?? "place") }
        }
      }
      if !plan.personal_checkin_items.isEmpty { SectionTitle(text: "Questions for your check-ins") }
      ForEach(Array(plan.personal_checkin_items.enumerated()), id: \.offset) { i, it in
        PlanLine(title: it.question, kept: $keepItems[i]) { Origin(quote: it.quote) }
      }
      if !plan.actions.isEmpty { SectionTitle(text: "What helps you") }
      ForEach(Array(plan.actions.enumerated()), id: \.offset) { i, a in
        PlanLine(title: a.text, kept: $keepActions[i]) { Text("“\(a.quote)”").font(HearthFont.body(14)).foregroundStyle(Theme.muted) }
      }
      if plan.rules.isEmpty && plan.personal_checkin_items.isEmpty && plan.actions.isEmpty {
        Text("No cards came out of this text. You can add them by hand.")
      }
      HStack(spacing: 12) {
        Button("Edit my text") { mode = .write }.buttonStyle(.secondary)
        Button("Save these cards") { save(plan, rules: keepRules, items: keepItems, actions: keepActions) }.buttonStyle(.primary)
      }
      .padding(.top, 8)
    }
  }

  /// Name a place for a place rule: one of the learned places, or "I'm here now".
  @ViewBuilder private func placePicker(_ i: Int, label: String) -> some View {
    let learned = app.engineState?.places.filter { $0.minutes > 0 }.sorted { $0.minutes > $1.minutes }.prefix(8) ?? []
    VStack(alignment: .leading, spacing: 6) {
      Text("Your \(label)").font(HearthFont.body(14, weight: "SemiBold"))
      if let name = placeNames[i] {
        Text("Chosen: \(name)").font(HearthFont.body(14)).foregroundStyle(Theme.steady)
      } else {
        Muted("Pick the place so Hearth can count your visits. Without one, this line is not saved.")
      }
      HStack {
        Button("I'm here now") {
          Task {
            if let c = await LocationCollector.shared.currentCoordinate() { places[i] = (c.latitude, c.longitude); placeNames[i] = "where you are now" }
          }
        }
        .buttonStyle(.link)
        if !learned.isEmpty {
          Menu("A place Hearth has seen") {
            ForEach(Array(learned), id: \.id) { p in
              Button("\(p.label ?? "Place") · \(Int(p.minutes / 60)) h there") { places[i] = (p.lat, p.lon); placeNames[i] = p.label ?? "a place you visit" }
            }
          }
          .font(HearthFont.body(15, weight: "Medium"))
        }
      }
    }
  }

  // Fallback form ------------------------------------------------------------------------

  private var fallbackView: some View {
    ScreenScroll(title: "Your plan") {
      Text("The on-device model is not available, so fill this in by hand. It stays on this iPhone.")
      SectionTitle(text: "Which of these happen when things start to slip?")
      SuggestionPicker(picked: $picked)
      ForEach(Array(Copy.placeSigns.enumerated()), id: \.offset) { i, m in
        Toggle(m.text, isOn: $manualPlaces[i]).tint(Theme.magenta)
      }
      TextArea(label: "Other signs to ask about in check-ins (one per line, e.g. “Did you reply to messages today”)", text: $manualItems)
      TextArea(label: "What helps you (one per line)", text: $manualActions)
      Button("Next") {
        var plan = suggestionPlan()
        for (i, m) in Copy.placeSigns.enumerated() where manualPlaces[i] {
          plan.rules.append(VerifiedRule(feature: m.feature, direction: m.direction, place_label: m.place, quote: m.text))
        }
        for q in manualItems.split(separator: "\n").map({ $0.trimmingCharacters(in: .whitespaces) }).filter({ !$0.isEmpty }) {
          plan.personal_checkin_items.append(VerifiedItem(question: q.hasSuffix("?") ? q : q + "?", quote: q))
        }
        for a in manualActions.split(separator: "\n").map({ $0.trimmingCharacters(in: .whitespaces) }).filter({ !$0.isEmpty }) {
          plan.actions.append(VerifiedAction(text: a, quote: a))
        }
        show(plan, ranOn: "template")
      }
      .buttonStyle(.primary)
    }
  }

  private func save(_ plan: VerifiedPlan, rules: [Bool], items: [Bool], actions: [Bool]) {
    app.savePlan(warning: warning, helps: helps, plan: plan, keepRules: rules, keepItems: items, keepActions: actions, places: places)
    if first || !app.settings.baselineDone {
      app.path = [.baselinePhq]
    } else {
      app.path.removeAll()
    }
  }
}

/// One line of the plan: what it is, where it came from, and a tick to keep it (on by default).
struct PlanLine<Content: View>: View {
  let title: String
  @Binding var kept: Bool
  @ViewBuilder var detail: Content
  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        Text(title).font(HearthFont.body(17, weight: "SemiBold")).foregroundStyle(kept ? Theme.ink : Theme.muted)
        detail
        if !kept { Text("Not kept").font(HearthFont.body(13)).foregroundStyle(Theme.muted) }
      }
      Spacer()
      Button { kept.toggle() } label: {
        Image(systemName: "checkmark")
          .font(.system(size: 16, weight: .bold))
          .foregroundStyle(kept ? .white : Theme.line)
          .frame(width: 44, height: 44)
          .background(Circle().fill(kept ? Theme.magenta : .white))
          .overlay(Circle().stroke(kept ? Theme.magenta : Theme.line, lineWidth: 1.5))
      }
      .buttonStyle(.bare)
      .accessibilityLabel("Keep: \(title)")
      .accessibilityValue(kept ? "on" : "off")
    }
    .padding(.vertical, 10)
    .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
  }
}

/// Shows where a card came from: the user's own words, or a suggestion they ticked.
struct Origin: View {
  let quote: String
  var body: some View {
    if Copy.suggestionTexts.contains(quote) {
      Text("Suggested sign you ticked: \(quote)").font(HearthFont.body(14)).foregroundStyle(Theme.muted)
    } else {
      Text("“\(quote)”").font(HearthFont.body(14)).foregroundStyle(Theme.muted)
    }
  }
}

struct SuggestionPicker: View {
  @Binding var picked: Set<String>
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Muted("Hearth can measure these")
      FlowLayout { ForEach(Copy.suggestedSigns, id: \.id) { x in Chip(text: x.text, selected: picked.contains(x.id)) { toggle(x.id) } } }
      Muted("Asked in your check-ins")
      FlowLayout { ForEach(Copy.suggestedItems, id: \.id) { x in Chip(text: x.text, selected: picked.contains(x.id)) { toggle(x.id) } } }
    }
  }
  private func toggle(_ id: String) { if picked.contains(id) { picked.remove(id) } else { picked.insert(id) } }
}

extension String { var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) } }
