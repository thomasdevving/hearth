import SwiftUI

/// `checkin` (docs/01 §4): task A intro, the three momentary items and company (verbatim
/// from shared/questionnaires/momentary.json), the user's own items, optional free text.
/// "Not today" and "Why am I being asked?" are always there (docs/01 §7).
struct CheckinView: View {
  @Environment(AppModel.self) private var app
  let id: String
  @State private var intro: (text: String, ranOn: String)?
  @State private var vals: [String: Int] = [:]
  @State private var who = ""
  @State private var personal: [String: String] = [:]
  @State private var text = ""
  @State private var why = false
  @State private var busy = false
  @State private var done: String?
  /// "What helped me last time": task R on what was just written (after saving).
  @State private var recall: HelpedRecall?
  /// Task I: own questions filled in from what was said.
  @State private var prefill: Prefill = .idle
  enum Prefill { case idle, working, done, none }

  #if DEBUG
  /// `-HearthCheckinAnswer "<text>"` answers this check-in with that text and saves it (for
  /// screenshots of what comes after a check-in).
  private static var autoAnswer: String? { UserDefaults.standard.string(forKey: "HearthCheckinAnswer") }
  /// `-HearthCheckinPrefill "<text>"` writes that text and fills in the own questions from it.
  private static var autoPrefill: String? { UserDefaults.standard.string(forKey: "HearthCheckinPrefill") }
  #else
  private static let autoAnswer: String? = nil
  private static let autoPrefill: String? = nil
  #endif

  var body: some View {
    let rec = app.store.first(CheckinRecord.self, where: #Predicate { $0.id == id })?.value
    let items = Shared.momentary.items
    let scales = items.filter { $0.type == "scale" }
    let company = items.first { $0.id == "company" }
    let own = app.store.activeItems()
    if let done {
      ScreenScroll(title: "Thanks") {
        Text(done).fixedSize(horizontal: false, vertical: true)
        if let recall { HelpedRecallView(recall: recall) }
        Button("Back to today") { app.path.removeAll() }.buttonStyle(.primary)
      }
      .navigationBarBackButtonHidden(true)
    } else if let rec {
      ScreenScroll(title: "Check-in", badge: intro?.ranOn, anchor: WhyView.debugAnchor) {
        Text(intro?.text ?? "…").font(HearthFont.body(20, weight: "Medium")).fixedSize(horizontal: false, vertical: true)
        Button("Why am I being asked?") { why.toggle() }.buttonStyle(.link)
        if why {
          Muted("Some check-ins are random, some come because your pattern changed. You'll hear which after you answer.")
        }
        ForEach(scales, id: \.id) { s in
          VStack(alignment: .leading, spacing: 8) {
            Text(s.text).font(HearthFont.body(17, weight: "SemiBold"))
            HStack(spacing: 6) {
              ForEach((s.min ?? 1)...(s.max ?? 7), id: \.self) { v in
                let sel = vals[s.id] == v
                Button { vals[s.id] = v } label: {
                  Text("\(v)").font(HearthFont.body(17, weight: sel ? "SemiBold" : "Regular"))
                    .foregroundStyle(sel ? .white : Theme.ink)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(RoundedRectangle(cornerRadius: 10).fill(sel ? Theme.magenta : .white))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(sel ? Theme.magenta : Theme.line, lineWidth: 1.5))
                }
                .buttonStyle(.bare)
                .accessibilityLabel("\(v)")
                .accessibilityAddTraits(sel ? [.isSelected] : [])
              }
            }
            HStack { Text(s.min_label ?? ""); Spacer(); Text(s.max_label ?? "") }.font(HearthFont.body(13)).foregroundStyle(Theme.muted)
          }
          .padding(.top, 6)
        }
        if let company {
          Text(company.text).font(HearthFont.body(17, weight: "SemiBold")).padding(.top, 6)
          FlowLayout { ForEach(company.options ?? [], id: \.self) { o in Chip(text: o, selected: who == o) { who = o } } }
        }
        if !own.isEmpty { SectionTitle(text: "Your own questions") }
        ForEach(own, id: \.id) { p in
          VStack(alignment: .leading, spacing: 6) {
            Text(p.question)
            HStack { ForEach(Shared.momentary.personal_item_options, id: \.self) { a in Chip(text: a, selected: personal[p.id] == a) { personal[p.id] = a } } }
          }
        }
        TextArea(label: Shared.momentary.free_text_prompt, text: $text)
        Muted("Stays on this device.")
        FlowLayout(spacing: 10) {
          MicButton(label: "Talk") { t in text = text.isEmpty ? t : "\(text) \(t)" }
          if !own.isEmpty && !text.trimmed.isEmpty && app.spokenModelMayRun {
            Button(prefill == .working ? "Reading on this device…" : "Fill in my questions from what I said") { Task { await prefillOwn(own) } }
              .buttonStyle(.compact).disabled(prefill == .working)
          }
        }
        if prefill == .done { Muted("Your own questions were filled in from your words. Check them before saving.") }
        if prefill == .none { Muted("That needs the on-device model. Please tap your answers.") }
        HStack(spacing: 12) {
          Button(busy ? "Saving…" : "Save") { Task { await save(rec) } }
            .buttonStyle(.primary)
            .disabled(busy || scales.contains { vals[$0.id] == nil } || who.isEmpty)
          Button("Not today") { app.skipCheckin(id: id); app.path.removeAll() }
            .buttonStyle(.secondary).disabled(busy)
        }
      }
      .task(id: id) {
        await loadIntro(rec)
        if let t = Self.autoPrefill, prefill == .idle {
          text = t
          await prefillOwn(own)
        }
        if let t = Self.autoAnswer, !busy {
          for s in scales { vals[s.id] = 3 }
          who = company?.options?.first ?? "Alone"
          text = t
          await save(rec)
        }
      }
    } else {
      ScreenScroll(title: "Check-in") { Muted("This check-in is no longer open.") }
    }
  }

  /// Task I: only the user's own questions are read from the text; the three momentary items
  /// are always tapped (R1). The answers are shown and can be changed before saving.
  private func prefillOwn(_ own: [PersonalItemValue]) async {
    prefill = .working
    if let answers = await app.answersFromSpeech(text, items: own) {
      for (id, a) in answers { personal[id] = a }
      prefill = .done
    } else {
      prefill = .none
    }
  }

  /// Task A only for a triggered check-in; random and fixed ones use their fixed sentence
  /// without a model (docs/05 task A).
  private func loadIntro(_ rec: CheckinRecordValue) async {
    guard intro == nil else { return }
    if rec.kind == "triggered" && !rec.reasons.isEmpty {
      let h = Clock.calendar.component(.hour, from: .now)
      let input: [String: Any] = ["contributors": rec.reasons.prefix(2).map(\.phrase), "partOfDay": h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"]
      let res = await app.router.run("A", input: input)
      if res.ok, let o = JSONText.object(res.json ?? "") as? [String: Any], let t = o["intro"] as? String {
        intro = (t, res.ranOn)
      } else {
        intro = (Copy.introTriggered, "template")
      }
    } else {
      intro = (rec.kind == "fixed" ? Copy.introFixed : rec.kind == "triggered" ? Copy.introTriggered : Copy.introRandom, "template")
    }
  }

  private func save(_ rec: CheckinRecordValue) async {
    busy = true
    let sub = AppModel.CheckinSubmission(mood_low: vals["mood_low"] ?? 1, enjoyment: vals["enjoyment"] ?? 1, energy: vals["energy"] ?? 1, company: who, personal: personal, freeText: text.isEmpty ? nil : text)
    let res = await app.completeCheckin(id: id, sub)
    busy = false
    // The safety screen is open; coming back shows the saved state, never an editable copy that
    // could be saved (and logged) a second time.
    if res.safety {
      done = "Your answers are saved."
      return
    }
    // "What helped me last time": recall by meaning, on this device, from what was just written.
    let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
    recall = t.isEmpty ? HelpedRecall.none : await app.recallFromText(t)
    // After answering, the user is told why they were asked (docs/04 §7.1).
    let after: String
    switch rec.kind {
    case "triggered": after = "This check-in came because some of your signals changed: \(rec.reasons.map(\.phrase).joined(separator: "; ").nilIfEmpty ?? "a small change across several signals")."
    case "fixed": after = "This was your regular check-in."
    default: after = "This was a random check-in. They help you see later whether the app's questions are useful for you."
    }
    done = after + (res.offerPhq2 ? " Two short questions are waiting on the home screen." : "")
  }
}
