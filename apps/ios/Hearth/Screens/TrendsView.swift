import Charts
import SwiftUI

/// `trends` (docs/01 §4): deviation index with its control limit, per-domain contributions,
/// questionnaire scores, context periods shaded, and every signal.
struct TrendsView: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    let _ = app.revision
    let all = app.store.records().compactMap(\.value)
    // Charts start at the first day with a usual range (DECISIONS, Polish).
    let first = all.firstIndex { $0.UCL != nil } ?? all.count
    let records = Array(all[first...])
    let contexts = app.store.all(ContextLabel.self).compactMap(\.value).filter(\.confirmed)
    ScreenScroll(title: "Trends", anchor: WhyView.debugAnchor) {
      if all.isEmpty {
        Muted("No days yet. Hearth scores each day once it is over.")
      } else if records.isEmpty {
        Muted("Hearth is still learning your usual range (about two weeks of data). \(all.count) days so far.")
      } else {
        Muted("How far your days are from your usual pattern. When the smoothed line stays above your usual range, Hearth calls it a change.")
        SectionTitle(text: "Change index")
        IndexChart(records: records, contexts: contexts)
        legend([("Daily index", Color(hex: 0x8B8A85)), ("Smoothed", Theme.magenta), ("Your usual range (limit)", Theme.ink)])
        SectionTitle(text: "By domain")
        domainChart(records)
        if let personal = app.engineState?.personal {
          WeightsSection(personal: personal, domains: Self.domains.filter { d in records.contains { $0.domainScores[d] != nil } }, colors: Self.domainColors)
        }
        if let response = all.last?.response { ResponseSection(response: response) }
      }
      questionnaires
      if !all.isEmpty { stateCounts(all) }
      if !all.isEmpty { signals(all) }
      AskSection()
    }
  }

  static let domains = ["activity", "rhythm", "sleep", "body", "mobility", "phone"]
  static let domainColors: [String: Color] = ["activity": Theme.magenta, "rhythm": Color(hex: 0x2F6DB5), "sleep": Color(hex: 0x6B4FA0), "body": Theme.changed, "mobility": Theme.steady, "phone": Theme.muted]

  private func domainChart(_ records: [DayRecordValue]) -> some View {
    let colors = Self.domainColors
    let used = Self.domains.filter { d in records.contains { $0.domainScores[d] != nil } }
    return VStack(alignment: .leading) {
      Chart {
        ForEach(used, id: \.self) { dom in
          ForEach(records, id: \.date) { r in
            if let v = r.domainScores[dom], let d = Clock.date(r.date) {
              LineMark(x: .value("Date", d), y: .value("Score", v), series: .value("Domain", dom)).foregroundStyle(colors[dom] ?? Theme.ink)
            }
          }
        }
      }
      .chartXAxis { AxisMarks(values: .stride(by: .month)) { _ in AxisGridLine(); AxisValueLabel(format: .dateTime.month(.abbreviated)) } }
      .frame(height: 180)
      legend(used.map { (Copy.domain[$0] ?? $0, colors[$0] ?? Theme.ink) })
    }
  }

  private func legend(_ items: [(String, Color)]) -> some View {
    FlowLayout(spacing: 12) {
      ForEach(items, id: \.0) { item in
        HStack(spacing: 6) { RoundedRectangle(cornerRadius: 2).fill(item.1).frame(width: 14, height: 4); Text(item.0).font(HearthFont.body(13)).foregroundStyle(Theme.ink2) }
      }
    }
  }

  @ViewBuilder private var questionnaires: some View {
    let qs = app.store.all(QuestionnaireRecord.self, sort: [SortDescriptor(\.takenAt)]).compactMap(\.value)
    SectionTitle(text: "Questionnaires")
    if qs.isEmpty { Muted("None yet.") }
    ForEach(qs, id: \.id) { q in
      HStack {
        Text(q.instrument == "PHQ9" ? "PHQ-9" : "PHQ-2").font(HearthFont.body(16, weight: "SemiBold"))
        Text(Clock.pretty(String(q.takenAt.prefix(10)))).foregroundStyle(Theme.muted)
        Spacer()
        Text("\(q.result.total) of \(q.instrument == "PHQ9" ? 27 : 6)")
      }
    }
    if qs.contains(where: { $0.instrument == "PHQ9" }) {
      Muted("Your own usual PHQ-9 score is the reference for a change, not a general cut-off alone.")
    }
  }

  /// Days in each state over the last 120 scored days (docs/10 metric 13).
  private func stateCounts(_ all: [DayRecordValue]) -> some View {
    let last = all.suffix(120)
    let order: [(EngineStateName, String)] = [(.WARM_UP, "Learning your pattern"), (.MONITOR, "Steady"), (.ELEVATED, "Changed"), (.CONFIRMED, "Changed, confirmed by a questionnaire")]
    return VStack(alignment: .leading, spacing: 4) {
      SectionTitle(text: "Days in each state")
      Muted("Your last \(last.count) scored days, \(Clock.pretty(last.first?.date ?? "")) to \(Clock.pretty(last.last?.date ?? "")).")
      ForEach(order, id: \.0) { st, label in
        HStack { Text(label); Spacer(); Text("\(last.filter { $0.state == st }.count)").font(HearthFont.body(16, weight: "SemiBold")) }
      }
      let episodes = zip(last.dropLast(), last.dropFirst()).filter { $0.0.state != .ELEVATED && $0.1.state == .ELEVATED }.map { Clock.pretty($0.1.date) }
      if !episodes.isEmpty { Muted("Changes started on: \(episodes.joined(separator: ", ")).") }
    }
  }

  private func signals(_ records: [DayRecordValue]) -> some View {
    let ids = ["steps", "active_hours", "walking_speed", "rhythm_stability", "fragmentation", "relative_amplitude", "rest_duration", "rest_midpoint", "rest_regularity", "hrv", "resting_hr", "home_stay", "location_entropy", "places_visited", "routine_regularity"]
    let recent = records.suffix(28)
    let places = app.engineState?.places ?? []
    return VStack(alignment: .leading, spacing: 4) {
      SectionTitle(text: "Your signals")
      Muted("The last four weeks. A dash means no data for that day.")
      ForEach(ids.filter { id in recent.contains { ($0.features.values[id] ?? nil) != nil } }, id: \.self) { f in
        let vals = recent.map { $0.features.values[f] ?? nil }
        let label = f.hasPrefix("rest") && recent.last?.features.restSource == "healthkit" ? Copy.feature(f).replacingOccurrences(of: "Rest", with: "Sleep") : Copy.feature(f, places: places)
        HStack {
          Text(label).font(HearthFont.body(15, weight: "Medium"))
          Spacer()
          Sparkline(values: vals)
          Text(Copy.value(f, vals.compactMap { $0 }.last)).font(HearthFont.body(14)).frame(minWidth: 64, alignment: .trailing)
        }
        .accessibilityElement(children: .combine)
      }
    }
  }
}

/// "What counts most for you" (docs/04 §4.4): the personal domain weights, or where the
/// learning stands. Every number comes from the engine.
struct WeightsSection: View {
  let personal: PersonalWeightsValue
  let domains: [String]
  let colors: [String: Color]
  private let need = 20 // weightMinSamples in shared/config/defaults.json

  var body: some View {
    SectionTitle(text: "What counts most for you")
    if personal.isActive, let top = domains.max(by: { personal.weight($0) < personal.weight($1) }) {
      Muted("Learned from \(personal.n) random check-ins: your low days went with changes in \((Copy.domain[top] ?? top).lowercased()) most. Hearth gives that more weight in your total.")
      VStack(spacing: 10) {
        ForEach(domains, id: \.self) { d in
          HStack(spacing: 12) {
            Text(Copy.domain[d] ?? d).font(HearthFont.body(15, weight: "SemiBold")).frame(width: 96, alignment: .leading)
            GeometryReader { geo in
              ZStack(alignment: .leading) {
                Capsule().fill(Theme.line)
                Capsule().fill(colors[d] ?? Theme.magenta).frame(width: geo.size.width * min(1, personal.weight(d) / 2))
                Rectangle().fill(Theme.ink.opacity(0.55)).frame(width: 2, height: 18).offset(x: geo.size.width / 2 - 1)
              }
            }
            .frame(height: 10)
            Text(Copy.weightText(personal.weight(d))).font(HearthFont.body(15, weight: "SemiBold")).monospacedDigit().frame(width: 44, alignment: .trailing)
          }
          .accessibilityElement(children: .combine)
          .accessibilityLabel("\(Copy.domain[d] ?? d): \(Copy.weightText(personal.weight(d)))")
        }
      }
      .padding(.vertical, 6)
      Muted("The line marks equal weight (1×). Each weight stays between 0.5× and 2×, changes at most once a week, and stays put while your days look changed.")
    } else if personal.status == "collecting" || personal.n < need {
      Muted("Hearth learns which signals go with your low days, from your answers to random check-ins. Until then every kind of signal counts the same.")
      ProgressView(value: Double(min(personal.n, need)), total: Double(need)).tint(Theme.magenta)
      Muted("\(min(personal.n, need)) of \(need) random check-ins")
    } else if personal.status == "waiting_for_audit" {
      Muted("Enough check-ins. Hearth waits until your check-ins show that its alerts mean something for you; until then every kind of signal counts the same.")
    } else {
      Muted("Every kind of signal counts the same for you: on your random check-ins, no one kind went with your low days more than the others.")
    }
  }
}

/// "Check-ins answered" (docs/04 §7.5): the last `responseRecentDays` against the user's usual.
/// Leaving more check-ins than usual can itself be an early sign; Hearth then offers PHQ-2.
struct ResponseSection: View {
  let response: ResponseSignalValue
  private var days: String { Shared.configNumber("responseRecentDays") }

  var body: some View {
    SectionTitle(text: "Check-ins answered")
    if response.status == "collecting" {
      Muted("Leaving more check-ins unanswered than usual can be an early sign too. Once there are enough, Hearth compares the last \(days) days with your own usual. Days on a confirmed holiday, trip or illness don't count.")
    } else {
      (Text("Last \(days) days: ") + Text("\(response.nRecent - response.missedRecent) of \(response.nRecent)").bold() + Text(". Before that: \(response.nUsual - response.missedUsual) of \(response.nUsual)."))
        .font(HearthFont.body(16))
      Muted(response.status == "fewer_answers"
        ? "That is clearly fewer than usual for you, so Hearth offered two short questions. It can just be a busy time."
        : "About as usual for you. If you start leaving clearly more than usual, Hearth offers two short questions.")
    }
  }
}
