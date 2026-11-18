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
    ScreenScroll(title: "Trends") {
      if all.isEmpty {
        Muted("No days yet. Hearth scores each day once it is over.")
      } else if records.isEmpty {
        Muted("Hearth is still learning your usual range (about two weeks of data). \(all.count) days so far.")
      } else {
        Muted("Each day is compared with your own usual days. The smoothed line crossing your usual range is what Hearth calls a change.")
        SectionTitle(text: "Change index")
        indexChart(records, contexts: contexts)
        legend([("Daily index", Color(hex: 0x8B8A85)), ("Smoothed", Theme.magenta), ("Your usual range (limit)", Theme.ink)])
        SectionTitle(text: "By domain")
        domainChart(records)
      }
      questionnaires
      if !all.isEmpty { signals(all) }
    }
  }

  private func indexChart(_ records: [DayRecordValue], contexts: [ContextLabelValue]) -> some View {
    Chart {
      ForEach(contexts.filter { $0.kind == "explains_sensors" }, id: \.id) { c in
        if let s = Clock.date(c.start), let e = Clock.date(c.end) {
          RectangleMark(xStart: .value("Start", s), xEnd: .value("End", e)).foregroundStyle(Theme.magentaTint)
        }
      }
      ForEach(records, id: \.date) { r in
        if let d = Clock.date(r.date) {
          if let D = r.D {
            PointMark(x: .value("Date", d), y: .value("Daily index", D)).foregroundStyle(Color(hex: 0x8B8A85)).symbolSize(12)
          }
          if r.UCL != nil {
            LineMark(x: .value("Date", d), y: .value("Smoothed", r.S), series: .value("Series", "S")).foregroundStyle(Theme.magenta).lineStyle(.init(lineWidth: 2.5))
          }
          if let u = r.UCL {
            LineMark(x: .value("Date", d), y: .value("Limit", u), series: .value("Series", "UCL")).foregroundStyle(Theme.ink).lineStyle(.init(lineWidth: 1.5, dash: [6, 4]))
          }
        }
      }
    }
    .chartXAxis { AxisMarks(values: .stride(by: .month)) { _ in AxisGridLine(); AxisValueLabel(format: .dateTime.month(.abbreviated)) } }
    .frame(height: 220)
    .accessibilityLabel("Change index per day with the smoothed line and your usual range")
  }

  private func domainChart(_ records: [DayRecordValue]) -> some View {
    let colors: [String: Color] = ["activity": Theme.magenta, "rhythm": Color(hex: 0x2F6DB5), "sleep": Color(hex: 0x6B4FA0), "body": Theme.changed, "mobility": Theme.steady, "phone": Theme.muted]
    let used = ["activity", "rhythm", "sleep", "body", "mobility", "phone"].filter { d in records.contains { $0.domainScores[d] != nil } }
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
