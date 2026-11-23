import Charts
import SwiftUI

/// What the Why? screen shows, all from the engine (`usualRangeSeries` and `whyTimeline` in
/// packages/engine/src/explain.ts) over the stored day records. Swift only picks the window.
struct WhyData {
  /// How many days the Why? charts show (as on the web).
  static let windowDays = 42

  let series: [UsualPoint]
  let timeline: WhyTimelineValue
  /// The records in the window, for the index chart.
  let records: [DayRecordValue]
  let from: String

  /// The last day with a value and a usual range: the one the sentence talks about.
  var lastPoint: UsualPoint? { series.last { $0.value != nil && $0.median != nil } }

  /// The day the trend crossed and the single day that did not count, inside the window.
  var marks: [DayMark] {
    var out: [DayMark] = []
    if let d = timeline.singleDay, d.date >= from { out.append(DayMark(date: d.date, label: "one day", color: Theme.ink2)) }
    if let e = timeline.episode, e.start >= from { out.append(DayMark(date: e.start, label: "Hearth noticed", color: Theme.changed)) }
    return out
  }

  /// nil when there are no scored days yet.
  @MainActor
  static func load(store: Store, feature: String) throws -> WhyData? {
    let stored = store.records()
    guard let lastDate = stored.last?.date else { return nil }
    let from = Clock.addDays(lastDate, -(windowDays - 1))
    let records = stored.map { RawJSON($0.json) }
    // The same contexts and questionnaires the days were scored with (AppModel.processDays).
    let contexts = store.all(ContextLabel.self).filter(\.confirmed).map { RawJSON($0.json) }
    let questionnaires = store.all(QuestionnaireRecord.self).map { RawJSON($0.json) }
    let series = try Engine.shared.decode([UsualPoint].self, "usualRangeSeries", records, feature, from, contexts, questionnaires, Shared.config)
    let timeline = try Engine.shared.decode(WhyTimelineValue.self, "whyTimeline", records, Shared.config)
    let window = stored.filter { $0.date >= from }.compactMap(\.value)
    return WhyData(series: series, timeline: timeline, records: window, from: from)
  }
}

/// "Why?": one signal against the user's own usual range, then why one day did not count and
/// the trend did. Every number comes from the engine (R2); no model; plain words without
/// diagnosis (R9). Opened from the phrases under "Why?" on Today.
struct WhyView: View {
  @Environment(AppModel.self) private var app
  let feature: String
  @State private var data: WhyData?
  @State private var failed = false

  var body: some View {
    ScreenScroll(title: "Why?", anchor: Self.debugAnchor) {
      if let data { content(data) } else if failed {
        Muted("Hearth could not work this out just now.")
      } else {
        ProgressView().frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .task(id: app.revision) {
      do { data = try WhyData.load(store: app.store, feature: feature); failed = data == nil } catch { failed = true }
    }
  }

  #if DEBUG
  /// `-HearthScrollBottom YES` shows the end of the screen (for screenshots).
  static var debugAnchor: UnitPoint? { UserDefaults.standard.bool(forKey: "HearthScrollBottom") ? .bottom : nil }
  #else
  static let debugAnchor: UnitPoint? = nil
  #endif

  private var label: String {
    let places = app.engineState?.places ?? []
    let healthkit = app.latestRecord?.features.restSource == "healthkit"
    // As on Trends: rest from HealthKit sleep is called sleep.
    return feature.hasPrefix("rest") && healthkit ? Copy.feature(feature).replacingOccurrences(of: "Rest", with: "Sleep") : Copy.feature(feature, places: places)
  }

  @ViewBuilder private func content(_ d: WhyData) -> some View {
    let rule = app.store.activeRules().first { Copy.ruleFeature($0) == feature }

    step(1, "\(label) against your usual days")
    if let rule {
      Text("Your sign: “\(rule.quote)”").font(HearthFont.body(16)).italic().foregroundStyle(Theme.magentaDeep)
    }
    if let p = d.lastPoint {
      let outside = p.z.map { abs($0) > 1 } ?? false
      Text("Usually \(fmt(p.median)), between \(fmt(p.low)) and \(fmt(p.high)). On \(Clock.pretty(p.date)): \(Text(fmt(p.value)).font(HearthFont.body(17, weight: "SemiBold"))), \(outside ? "outside your usual range." : "within your usual range.")")
        .fixedSize(horizontal: false, vertical: true)
    } else {
      Muted("Not enough of your own days yet to show a usual range for this signal.")
    }
    signalChart(d)
    legend
    Muted("The shaded band is your usual range.")

    step(2, "One day does not count")
    Text(d.timeline.singleDay.map { "On \(Clock.pretty($0.date)) one day stood out, but the trend stayed under the line. Hearth did nothing." }
      ?? "Hearth does not react to one day. It waits until the trend, the smoothed line, stays above your usual limit.")
      .fixedSize(horizontal: false, vertical: true)

    step(3, "Why Hearth asked")
    Text(d.timeline.episode.map { e in
      "On \(Clock.pretty(e.start)) the trend crossed the line\(d.timeline.risingDays >= 3 ? ", after rising for \(d.timeline.risingDays) days" : ""). That is when Hearth asked you a check-in."
    } ?? "Your days are within your usual pattern now.")
      .fixedSize(horizontal: false, vertical: true)
    IndexChart(records: d.records, marks: d.marks, stride: .weekOfYear, height: 200)
    Muted("Grey: each day. Pink: the trend. Dashed: your usual limit.")

    Muted("Worked out by Hearth's code, not a model. A change from your usual pattern, not a diagnosis.")
      .padding(.top, 12)
  }

  private func step(_ n: Int, _ title: String) -> some View {
    SectionTitle(text: "\(n) · \(title)")
  }

  /// The signal with its usual range shaded, the usual middle dashed, and the marked days.
  private func signalChart(_ d: WhyData) -> some View {
    let pts = d.series.compactMap { p in Clock.date(p.date).map { (date: $0, p: p) } }
    return Chart {
      ForEach(pts, id: \.p.date) { x in
        if let lo = x.p.low, let hi = x.p.high {
          AreaMark(x: .value("Date", x.date), yStart: .value("Low", lo), yEnd: .value("High", hi), series: .value("Series", "band"))
            .foregroundStyle(Theme.steady.opacity(0.14))
        }
        if let m = x.p.median {
          LineMark(x: .value("Date", x.date), y: .value("Usual middle", m), series: .value("Series", "median"))
            .foregroundStyle(Theme.steady).lineStyle(.init(lineWidth: 1.5, dash: [6, 4]))
        }
        if let v = x.p.value {
          LineMark(x: .value("Date", x.date), y: .value(label, v), series: .value("Series", "value"))
            .foregroundStyle(Theme.magenta).lineStyle(.init(lineWidth: 2))
          PointMark(x: .value("Date", x.date), y: .value(label, v)).foregroundStyle(Theme.magenta).symbolSize(16)
        }
      }
      ForEach(d.marks, id: \.self) { m in
        if let day = Clock.date(m.date) {
          RuleMark(x: .value("Date", day)).foregroundStyle(m.color).lineStyle(.init(lineWidth: 1.5, dash: [3, 3]))
        }
      }
    }
    .chartYScale(domain: .automatic(includesZero: false))
    .chartYAxis {
      AxisMarks(values: .automatic(desiredCount: 4)) { v in
        AxisGridLine()
        AxisValueLabel { if let y = v.as(Double.self) { Text(fmt(y)) } }
      }
    }
    .chartXAxis { AxisMarks(values: .stride(by: .weekOfYear)) { _ in AxisGridLine(); AxisValueLabel(format: .dateTime.day().month(.abbreviated)) } }
    .dayMarkLabels(d.marks)
    .frame(height: 200)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(label) over the last \(WhyData.windowDays) days, with your usual range shaded")
  }

  private var legend: some View {
    FlowLayout(spacing: 12) {
      swatch(label) { RoundedRectangle(cornerRadius: 2).fill(Theme.magenta).frame(width: 14, height: 3) }
      swatch("your usual range") { RoundedRectangle(cornerRadius: 2).fill(Theme.steady.opacity(0.14)).frame(width: 14, height: 10) }
      swatch("your usual middle") {
        Path { p in p.move(to: .init(x: 0, y: 1)); p.addLine(to: .init(x: 14, y: 1)) }
          .stroke(Theme.steady, style: .init(lineWidth: 1.5, dash: [4, 3])).frame(width: 14, height: 2)
      }
    }
    .accessibilityHidden(true)
  }

  private func swatch<S: View>(_ text: String, @ViewBuilder _ mark: () -> S) -> some View {
    HStack(spacing: 6) { mark(); Text(text).font(HearthFont.body(13)).foregroundStyle(Theme.ink2) }
  }

  /// Values as on the web's Why?: visits to a place are counted over 7 days.
  private func fmt(_ v: Double?) -> String {
    guard let v else { return "–" }
    if feature.hasPrefix("place_visits") { return "\(Copy.fmt((v * 10).rounded() / 10)) in 7 days" }
    return Copy.value(feature, v)
  }
}
