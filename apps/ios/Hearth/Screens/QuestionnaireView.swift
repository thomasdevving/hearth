import SwiftUI

/// One item per page, stem repeated, items and options verbatim from
/// shared/questionnaires/*.json (R1). No model output appears on these pages.
struct QuestionnairePages: View {
  @Environment(AppModel.self) private var app
  let instrument: String
  /// The onboarding PHQ-9: the user's starting point, never a change (docs/06 §3.4).
  var baseline = false
  var onDone: (QuestionnaireRecordValue) -> Void
  @State private var page = 0
  @State private var answers: [Int?] = []
  @State private var submitting = false
  /// A tap that started on the previous screen or question (a quick second tap) must not answer
  /// the question that has just appeared.
  @State private var appearedAt = Date.distantFuture

  var body: some View {
    let def = Shared.questionnaire(instrument)
    let item = def.items[min(page, def.items.count - 1)]
    VStack(alignment: .leading, spacing: 14) {
      Muted("\(def.title) · question \(page + 1) of \(def.items.count)")
      Text(def.stem).font(HearthFont.body(16)).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
      Text(item.text).font(HearthFont.body(22, weight: "SemiBold")).fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
      VStack(spacing: 10) {
        ForEach(def.options, id: \.value) { o in
          let selected = answers[safe: page] == o.value
          Button {
            // A second quick tap must not skip a question or run past the last one: the page
            // only moves from the page that was tapped, once.
            let tapped = page
            guard tapped < def.items.count, tapped < answers.count, Date().timeIntervalSince(appearedAt) > 0.4 else { return }
            answers[tapped] = o.value
            if tapped < def.items.count - 1 {
              DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { if page == tapped { page = tapped + 1 } }
            }
          } label: {
            Text(o.label)
              .font(HearthFont.body(17, weight: selected ? "SemiBold" : "Regular"))
              .foregroundStyle(selected ? .white : Theme.ink)
              .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
              .padding(.horizontal, 16)
              .background(RoundedRectangle(cornerRadius: 12).fill(selected ? Theme.magenta : .white))
              .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? Theme.magenta : Theme.line, lineWidth: 1.5))
          }
          .buttonStyle(.bare)
          .accessibilityAddTraits(selected ? [.isSelected] : [])
        }
      }
      HStack(spacing: 12) {
        if page > 0 { Button("Previous") { page -= 1 }.buttonStyle(.secondary) }
        if page == def.items.count - 1 {
          Button("Done") {
            guard !submitting else { return }
            submitting = true
            if let rec = app.submitQuestionnaire(instrument, answers: answers.compactMap { $0 }, baseline: baseline) { onDone(rec) } else { submitting = false }
          }
          .buttonStyle(.primary)
          .disabled(submitting || answers.count != def.items.count || answers.contains { $0 == nil })
        }
      }
    }
    .onAppear {
      if answers.count != def.items.count { answers = Array(repeating: nil, count: def.items.count) }
      appearedAt = Date()
    }
    // The same guard per question: a quick second tap must not answer the next one as well.
    .onChange(of: page) { _, _ in appearedAt = Date() }
  }
}

struct QuestionnaireView: View {
  @Environment(AppModel.self) private var app
  let instrument: String
  var body: some View {
    ScreenScroll(title: instrument == "PHQ2" ? "Two short questions" : "A short questionnaire") {
      QuestionnairePages(instrument: instrument) { rec in app.path.append(.result(rec.id, baseline: false)) }
      Button("Not today") { app.dismissQuestionnaire(instrument); app.path.removeAll() }.buttonStyle(.link)
    }
  }
}

/// `baseline_phq`: the first PHQ-9, the user's own reference (docs/06 §3.2).
struct BaselinePhqView: View {
  @Environment(AppModel.self) private var app
  var body: some View {
    ScreenScroll(title: "Your starting point") {
      Muted("Nine questions about the last two weeks. Later answers are compared with these.")
      QuestionnairePages(instrument: "PHQ9", baseline: true) { rec in app.path.append(.result(rec.id, baseline: true)) }
    }
  }
}

/// `result`: score, change from the user's own reference, and task C's explanation.
struct ResultView: View {
  @Environment(AppModel.self) private var app
  let id: String
  let baseline: Bool
  @State private var text: (body: String, ranOn: String)?

  var body: some View {
    let _ = app.revision
    let rec = app.store.first(QuestionnaireRecord.self, where: #Predicate { $0.id == id })?.value
    ScreenScroll(title: "Your result", badge: text?.ranOn) {
      if let rec {
        let r = rec.result
        let max = rec.instrument == "PHQ2" ? 6 : 27
        (Text("\(r.total) ").font(HearthFont.display(40)) + Text("out of \(max)").font(HearthFont.body(18)).foregroundColor(Theme.muted))
        if let c = r.changeFromReference, !baseline {
          Text(c == 0 ? "The same as your own usual score." : c > 0 ? "\(c) above your own usual score." : "\(-c) below your own usual score.")
        }
        Text(text?.body ?? "…").fixedSize(horizontal: false, vertical: true)
        if baseline && r.total >= 10 {
          Card(tone: .warm) {
            Text("A note about your answers").font(HearthFont.body(16, weight: "SemiBold"))
            Text("Hearth is built for people who are currently doing fairly well. Your answers suggest now may be a good moment to talk to your GP or clinician. You can still use the app.")
          }
        }
        if r.flagged && !baseline {
          Card(tone: .warm) {
            Text("Consider sharing this with your GP or clinician").font(HearthFont.body(16, weight: "SemiBold"))
            Text("You can create a summary to bring along or send.")
            Button("Share a summary ›") { app.path.append(.share) }.buttonStyle(.link)
          }
        }
        let phq9Open = app.store.openInbox().contains { $0.type == "questionnaire" && $0.instrument == "PHQ9" }
        Group {
          if baseline {
            Button("Start") {
              app.settings.baselineDone = true
              app.changed()
              app.path.removeAll()
              Task { await app.runDaily(reason: "baseline") }
            }
          } else if r.nextStep == "offer_phq9" && phq9Open {
            Button("Continue") { app.path.append(.questionnaire("PHQ9")) }
          } else if r.flagged {
            Button("See my plan") { app.path.removeAll(); app.selectedTab = .plan }
          } else {
            Button("Done") { app.path.removeAll() }
          }
        }
        .buttonStyle(.primary)
      } else {
        Muted("Loading…")
      }
    }
    .navigationBarBackButtonHidden(true)
    .task(id: id) { await explain(rec) }
  }

  /// Task C sees only the total, band and change, never the item answers (docs/06 §1).
  private func explain(_ rec: QuestionnaireRecordValue?) async {
    guard let rec, text == nil else { return }
    let r = rec.result
    // "A longer questionnaire comes next" only when one was actually offered (cooldown).
    let phq9Next = r.nextStep != "offer_phq9" || app.store.openInbox().contains { $0.type == "questionnaire" && $0.instrument == "PHQ9" }
    let contributors = app.latestRecord?.contributors.map(\.phrase) ?? []
    let input: [String: Any] = [
      "instrument": rec.instrument, "total": r.total, "band": r.band.map { $0 as Any } ?? NSNull(),
      "changeFromReference": r.changeFromReference.map { $0 as Any } ?? NSNull(), "flagged": r.flagged,
      "contributors": contributors, "nextStep": phq9Next ? (Copy.nextText[r.nextStep] ?? "") : Copy.phq9Recent,
    ]
    let res = await app.router.run("C", input: input)
    if res.ok, let obj = JSONText.object(res.json ?? "") as? [String: Any], let e = obj["explanation"] as? String {
      text = (e, res.ranOn)
    } else {
      text = (Copy.resultTemplate(r, phq9Next: phq9Next), "template")
    }
  }
}
