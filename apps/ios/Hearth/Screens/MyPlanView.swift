import SwiftUI

/// `my_plan`: the user's own plan, in their own words (web: MyPlan.tsx). When the state is
/// ELEVATED or CONFIRMED it opens with "your days look different" and, with a model on the
/// device, the actions picked for today (task K). Then the other actions with their smaller
/// steps, what came first in the last stretch, and the signs and questions.
struct MyPlanView: View {
  @Environment(AppModel.self) private var app
  /// Task K's pick: action ids (checked against the plan) and where it ran.
  @State private var fit: Pick?

  struct Pick: Equatable { var ids: [String]; var ranOn: String }

  var body: some View {
    let _ = app.revision
    let st = app.currentState
    let changed = st == .ELEVATED || st == .CONFIRMED
    let actions = app.store.activeActions()
    let rules = app.store.activeRules()
    let items = app.store.activeItems()
    let places = app.engineState?.places ?? []
    let last = app.latestRecord
    let contributors = last?.contributors.map(\.phrase) ?? []
    let choices = app.store.actionChoices()
    let today = Clock.today
    let picked = fit.map { f in f.ids.compactMap { id in actions.first { $0.id == id } } } ?? []
    let rest = actions.filter { a in !picked.contains { $0.id == a.id } }
    ScreenScroll(title: "Your plan", anchor: WhyView.debugAnchor) {
      if !app.settings.planDone && rules.isEmpty && actions.isEmpty {
        Muted("You have not written your plan yet.")
        Button("Set up my plan") { app.path.append(.planSetup(first: false)) }.buttonStyle(.primary)
      } else {
        if changed {
          (Text("Your days look different from usual\(contributors.isEmpty ? "" : ": " + contributors.joined(separator: ", ")).")
            .font(HearthFont.body(17, weight: "SemiBold")).foregroundStyle(Theme.ink)
            + Text(" This is what you wrote down for a time like this."))
            .foregroundStyle(Theme.ink2)
            .fixedSize(horizontal: false, vertical: true)
        }
        if let fit, !picked.isEmpty { forToday(picked, ranOn: fit.ranOn, choices: choices, today: today) }
        if picked.isEmpty || !rest.isEmpty { SectionTitle(text: picked.isEmpty ? "What helps you" : "Also on your list") }
        if actions.isEmpty { Muted("Nothing yet.") }
        if !rest.isEmpty {
          VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(rest.enumerated()), id: \.element.id) { i, a in
              ActionItemView(action: a, choices: choices, today: today)
                .padding(.horizontal, 16).padding(.vertical, 12)
                .overlay(alignment: .top) { if i > 0 { Rectangle().fill(Theme.line).frame(height: 1) } }
            }
          }
          .background(RoundedRectangle(cornerRadius: Theme.radius).fill(Color.white))
          .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line))
        }
        if st == .CONFIRMED {
          Card(tone: .plain) {
            Text("Talk it through with someone").font(HearthFont.body(16, weight: "SemiBold"))
            Text("You could bring your trends to your GP or clinician.")
          }
        }
        CallAFriendCard(people: People.all(app.store))
        // Folds, as on the web. "For your GP or clinician" and "What helped you before" come
        // between these two in later phases.
        VStack(alignment: .leading, spacing: 0) {
          WhatCameFirstFold()
          Fold(title: "Your signs and questions", hint: "\(rules.count) sign\(rules.count == 1 ? "" : "s") · \(items.count) question\(items.count == 1 ? "" : "s")") {
            Text("SIGNS YOU WATCH FOR").font(HearthFont.body(12, weight: "SemiBold")).tracking(1).foregroundStyle(Theme.muted)
            ForEach(rules, id: \.id) { r in
              VStack(alignment: .leading, spacing: 2) {
                Text("\(Copy.feature(Copy.ruleFeature(r), places: places)) \(Copy.direction(Copy.ruleFeature(r), r.direction))").font(HearthFont.body(16, weight: "SemiBold"))
                Text("“\(r.quote)”").font(HearthFont.body(14)).italic().foregroundStyle(Theme.ink2)
              }
            }
            if !items.isEmpty {
              Text("QUESTIONS IN YOUR CHECK-INS").font(HearthFont.body(12, weight: "SemiBold")).tracking(1).foregroundStyle(Theme.muted).padding(.top, 6)
              ForEach(items, id: \.id) { i in
                VStack(alignment: .leading, spacing: 2) {
                  Text(i.question).font(HearthFont.body(16, weight: "SemiBold"))
                  Text("“\(i.quote)”").font(HearthFont.body(14)).italic().foregroundStyle(Theme.ink2)
                }
              }
            }
            Button("Edit my plan") { app.path.append(.planSetup(first: false)) }.buttonStyle(.secondary).padding(.top, 4)
          }
          .padding(.top, -1)  // one line between two folds, not two
        }
        .padding(.top, 12)
      }
      HelpButton()
    }
    .onAppear {
      // Opening the plan closes the "your plan" reminder.
      for i in app.store.openInbox() where i.type == "show_plan" { app.store.close(i) }
      app.changed()
    }
    // Task K once per changed day and set of actions; without a model all actions are shown.
    .task(id: "\(changed)|\(last?.date ?? "")|\(actions.map(\.id).joined(separator: ","))") {
      guard changed, actions.count >= 2, fit == nil else { return }
      if let r = await app.pickForToday(actions: actions, today: contributors) { fit = Pick(ids: r.ids, ranOn: r.ranOn) }
    }
  }

  private func forToday(_ picked: [PlanActionValue], ranOn: String, choices: [ActionChoiceValue], today: String) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text("FOR TODAY").font(HearthFont.body(12, weight: "SemiBold")).tracking(1).foregroundStyle(Theme.magentaDeep)
          .accessibilityAddTraits(.isHeader).accessibilityLabel("For today")
        Spacer()
        ModelBadge(ranOn: ranOn)
      }
      ForEach(picked, id: \.id) { a in
        ActionItemView(action: a, choices: choices, today: today, showQuote: false, large: true)
      }
      Text("Picked from what you said helps.").font(HearthFont.body(14)).foregroundStyle(Theme.ink2)
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(RoundedRectangle(cornerRadius: Theme.radius).fill(Theme.magentaTint))
    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.magentaLine))
    .padding(.top, 8)
  }
}

/// `ledger` (docs/07 §2.9): every model call, where it ran and exactly what was sent.
struct LedgerView: View {
  @Environment(AppModel.self) private var app
  @State private var leftOnly = false
  @State private var open: String?
  @State private var all6 = false

  var body: some View {
    let _ = app.revision
    let all = app.store.all(LedgerEntry.self, sort: [SortDescriptor(\.at, order: .reverse)]).compactMap(\.value)
    let rows = all.filter { !leftOnly || $0.ranOn == "cloud" || $0.bytesSent > 0 }
    let device = all.filter { $0.ranOn == "on_device" }.count, cloud = all.filter { $0.ranOn == "cloud" }.count, none = all.filter { $0.ranOn == "none" }.count
    ScreenScroll(title: "Privacy ledger") {
      Muted("Every model call: which task, where it ran and exactly what was sent.")
      Text("\(device) on this device · \(cloud) in the cloud · \(none) without a model").font(HearthFont.body(16, weight: "Medium"))
      Toggle("Only show what left this device", isOn: $leftOnly).tint(Theme.magenta)
      if rows.isEmpty { Muted("Nothing yet.") }
      ForEach(all6 ? rows : Array(rows.prefix(6)), id: \.id) { e in
        VStack(alignment: .leading, spacing: 4) {
          (Text(Copy.taskName[e.task] ?? e.task).font(HearthFont.body(16, weight: "SemiBold")) + Text(" · \(Self.where(e))"))
          Text(Self.detail(e)).font(HearthFont.body(13)).foregroundStyle(Theme.muted)
          if e.ranOn == "cloud" {
            Button(open == e.id ? "Hide" : "What was sent (\(e.bytesSent) bytes)") { open = open == e.id ? nil : e.id }.buttonStyle(.link)
            if open == e.id { Text(e.payloadSent ?? "(nothing)").font(.system(.caption, design: .monospaced)).textSelection(.enabled) }
          }
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
      }
      if !all6 && rows.count > 6 { Button("Show all \(rows.count)") { all6 = true }.buttonStyle(.secondary) }
    }
  }

  static func `where`(_ e: LedgerEntryValue) -> String {
    e.ranOn == "on_device" ? "on this device" : e.ranOn == "cloud" ? "cloud (left this device)" : "no model (fallback)"
  }

  /// Readable date and time; the technical details stay in the stored entry.
  static func detail(_ e: LedgerEntryValue) -> String {
    let day = String(e.at.prefix(10)), time = String(e.at.dropFirst(11).prefix(5))
    return "\(Clock.pretty(day)), \(time)" + (e.decision.run == "model" ? "" : " · simple rules, no model")
  }
}

/// `context_confirm`: one tap to confirm a context found in a note (task H), or the one-tap
/// picker when no model is available. Nothing changes until the user confirms.
struct ContextConfirmView: View {
  @Environment(AppModel.self) private var app
  let inboxId: String
  @State private var picked = ""

  var body: some View {
    let item = app.store.first(InboxItem.self, where: #Predicate { $0.id == inboxId })
    let label = item?.contextJSON.flatMap { try? JSONText.decode(ContextLabelValue.self, $0) }
    if let item, item.status == "open", item.type == "context_expired" {
      expired(item)
    } else if let item, item.status == "open", let label {
      let picker = label.type.isEmpty
      ScreenScroll(title: picker ? "Is something changing your routine?" : "One quick check", badge: picker ? nil : (item.ranOn == "none" ? "template" : item.ranOn)) {
        if !picker {
          Text("\(Copy.context[label.type] ?? label.type) until \(Clock.pretty(label.end))?").font(HearthFont.body(20, weight: "Medium"))
          if let q = label.quote { Muted("From your note: “\(q)”") }
        } else {
          Muted("From your note: “\(item.sourceText ?? "")”. Pick one if it fits; nothing changes otherwise.")
          FlowLayout { ForEach(Copy.context.keys.sorted(), id: \.self) { t in Chip(text: Copy.context[t] ?? t, selected: picked == t) { picked = t } } }
        }
        Muted("If you confirm, the signals this explains are set aside until then, so they don't count as a change.")
        HStack(spacing: 12) {
          Button(picker ? "Save" : "Yes") {
            var l = label
            if picker { l.type = picked }
            app.confirmContext(l, inbox: item)
            app.path.removeAll()
          }
          .buttonStyle(.primary).disabled(picker && picked.isEmpty)
          Button(picker ? "Nothing like that" : "No") { app.rejectContext(item); app.path.removeAll() }.buttonStyle(.secondary)
        }
      }
    } else {
      ScreenScroll(title: "Confirm") { Muted("Nothing to confirm.") }
    }
  }

  private func expired(_ item: InboxItem) -> some View {
    let ctx = app.store.all(ContextLabel.self).compactMap(\.value).first { $0.id == item.contextId }
    return ScreenScroll(title: "Does this still apply?") {
      Text("\(ctx.map { "\(Copy.context[$0.type] ?? $0.type) ended on \(Clock.pretty($0.end))." } ?? "Your earlier note has ended.") Is it still going on?")
      HStack(spacing: 12) {
        Button("Yes, one more week") {
          if let c = ctx {
            let next = ContextLabelValue(id: newId("ctx"), type: c.type, kind: c.kind, start: Clock.today, end: Clock.addDays(Clock.today, 6), quote: c.quote, source: "manual", confirmed: true)
            app.confirmContext(next, inbox: item)
          } else { app.store.close(item); app.changed() }
          app.path.removeAll()
        }
        .buttonStyle(.primary)
        Button("No, it's over") { app.store.close(item); app.changed(); app.path.removeAll() }.buttonStyle(.secondary)
      }
    }
  }
}

/// `weekly`: the weekly reflection (task D). S1: it needs cloud consent, which is not
/// available in this build, so it is the template with the week's numbers.
struct WeeklyView: View {
  @Environment(AppModel.self) private var app
  @State private var text: (reflection: String, question: String, ranOn: String)?

  var body: some View {
    let weeks = app.store.all(WeekAggregate.self, sort: [SortDescriptor(\.isoWeek)]).compactMap(\.value)
    ScreenScroll(title: "Weekly reflection", badge: text?.ranOn) {
      if let t = text {
        Text(t.reflection).fixedSize(horizontal: false, vertical: true)
        Text(t.question).font(HearthFont.body(17, weight: "SemiBold"))
      } else { Muted("…") }
      Muted("Made from your weekly numbers only. Nothing was sent anywhere.")
    }
    .task {
      let last12 = Array(app.store.all(WeekAggregate.self, sort: [SortDescriptor(\.isoWeek)]).suffix(12))
      let res = await app.router.run("D", input: [:], options: .init(variantInput: { v in
        let ws = v == "lite" ? Array(last12.suffix(2)) : last12
        // The number of weeks is a fact from code, so the model may say "12 weeks" (R2).
        return ["variant": v, "number of weeks": ws.count, "weeks": ws.map { RawJSON($0.json) }]
      }))
      if res.ok, let o = JSONText.object(res.json ?? "") as? [String: Any], let r = o["reflection"] as? String, let q = o["open_question"] as? String {
        text = (r, q, res.ranOn)
      } else {
        let t = Copy.weeklyTemplate(weeks)
        text = (t.reflection, t.question, "template")
      }
    }
  }
}
