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

  var body: some View {
    let rec = app.store.first(CheckinRecord.self, where: #Predicate { $0.id == id })?.value
    let items = Shared.momentary.items
    let scales = items.filter { $0.type == "scale" }
    let company = items.first { $0.id == "company" }
    let own = app.store.activeItems()
    if let done {
      ScreenScroll(title: "Thanks") {
        Text(done).fixedSize(horizontal: false, vertical: true)
        Button("Back to today") { app.path.removeAll() }.buttonStyle(.primary)
      }
      .navigationBarBackButtonHidden(true)
    } else if let rec {
      ScreenScroll(title: "Check-in", badge: intro?.ranOn) {
        Text(intro?.text ?? "…").font(HearthFont.body(20, weight: "Medium")).fixedSize(horizontal: false, vertical: true)
        Button("Why am I being asked?") { why.toggle() }.buttonStyle(.link)
        if why {
          Muted("Sometimes I ask at random, sometimes because your pattern changed. I'll tell you which one after you answer, so it doesn't colour your answer.")
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
                .buttonStyle(.plain)
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
        HStack(spacing: 12) {
          Button(busy ? "Saving…" : "Save") { Task { await save(rec) } }
            .buttonStyle(.primary)
            .disabled(busy || scales.contains { vals[$0.id] == nil } || who.isEmpty)
          Button("Not today") { app.skipCheckin(id: id); app.path.removeAll() }
            .buttonStyle(.secondary).disabled(busy)
        }
      }
      .task(id: id) { await loadIntro(rec) }
    } else {
      ScreenScroll(title: "Check-in") { Muted("This check-in is no longer open.") }
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
    if res.safety { return }
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
