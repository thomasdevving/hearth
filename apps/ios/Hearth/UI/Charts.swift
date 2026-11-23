import Charts
import SwiftUI

/// Small line of the last values, as on the web `home`.
struct Sparkline: View {
  let values: [Double?]
  var body: some View {
    Chart {
      ForEach(Array(values.enumerated()), id: \.offset) { i, v in
        if let v { LineMark(x: .value("Day", i), y: .value("Value", v)).foregroundStyle(Theme.magenta).interpolationMethod(.monotone) }
      }
    }
    .chartXAxis(.hidden).chartYAxis(.hidden)
    .frame(width: 90, height: 32)
    .accessibilityHidden(true)
  }
}

struct DatedValue: Identifiable {
  let date: Date
  let value: Double
  var id: Date { date }
}

/// One series over time, with a 7-day mean drawn on top.
struct HistoryChart: View {
  let points: [DatedValue]
  let label: String
  var body: some View {
    let avg = rollingMean(points, 7)
    Chart {
      ForEach(points) { p in
        BarMark(x: .value("Date", p.date, unit: .day), y: .value(label, p.value))
          .foregroundStyle(Theme.magentaLine)
      }
      ForEach(avg) { p in
        LineMark(x: .value("Date", p.date, unit: .day), y: .value("7-day mean", p.value))
          .foregroundStyle(Theme.magenta).lineStyle(StrokeStyle(lineWidth: 2.5)).interpolationMethod(.monotone)
      }
    }
    .chartXAxis { AxisMarks(values: .stride(by: .month)) { _ in AxisGridLine(); AxisValueLabel(format: .dateTime.month(.abbreviated)) } }
    .frame(height: 180)
    .accessibilityLabel("\(label) per day over the last months, with a 7-day mean")
  }

  private func rollingMean(_ ps: [DatedValue], _ n: Int) -> [DatedValue] {
    guard ps.count >= n else { return [] }
    return (n - 1..<ps.count).map { i in
      let slice = ps[(i - n + 1)...i].map(\.value)
      return DatedValue(date: ps[i].date, value: slice.reduce(0, +) / Double(n))
    }
  }
}

/// A day marked on a chart with a dashed vertical line and a short label ("Hearth noticed",
/// "one day"), as the web's `markPlugin` on Why?.
struct DayMark: Hashable {
  let date: String
  let label: String
  let color: Color
}

extension View {
  /// Labels for `DayMark`s along the bottom of the plot area (or the top, where a chart's data
  /// sits low); overlapping labels stack away from that edge.
  func dayMarkLabels(_ marks: [DayMark], atTop: Bool = false) -> some View {
    chartOverlay { proxy in
      GeometryReader { geo in
        if let anchor = proxy.plotFrame {
          let plot = geo[anchor]
          let placed = DayMark.layout(marks, proxy: proxy, plot: plot, atTop: atTop)
          ForEach(placed, id: \.mark) { p in
            Text(p.mark.label)
              .font(HearthFont.body(12, weight: "SemiBold"))
              .foregroundStyle(p.mark.color)
              .padding(.horizontal, 3)
              .background(Color.white.opacity(0.85))
              .fixedSize()
              .position(x: p.x, y: p.y)
          }
        }
      }
      .accessibilityHidden(true)
    }
  }
}

extension DayMark {
  struct Placed { let mark: DayMark; let x: CGFloat; let y: CGFloat }

  /// Centre positions of the labels: right of the line, or left of it at the right edge. When
  /// a later label has to go left, a close earlier one goes left too, so neither crosses the
  /// other's line; overlapping labels stack upwards.
  static func layout(_ marks: [DayMark], proxy: ChartProxy, plot: CGRect, atTop: Bool) -> [Placed] {
    let width: (String) -> CGFloat = { CGFloat($0.count) * 6.6 + 6 }
    var items: [(mark: DayMark, x: CGFloat, left: Bool)] = []
    for m in marks.sorted(by: { $0.date < $1.date }) {
      guard let d = Clock.date(m.date), let px = proxy.position(forX: d) else { continue }
      let x = plot.minX + px
      if x < plot.minX || x > plot.maxX { continue }
      items.append((m, x, x + 4 + width(m.label) > plot.maxX))
    }
    for i in items.indices.reversed() where i > 0 && items[i].left && items[i].x - items[i - 1].x < 90 {
      if items[i - 1].x - 4 - width(items[i - 1].mark.label) >= plot.minX { items[i - 1].left = true }
    }
    // Each label takes the lowest row where it does not overlap a label already placed.
    var out: [Placed] = []
    var taken: [[ClosedRange<CGFloat>]] = []
    for it in items {
      let w = width(it.mark.label)
      let span = it.left ? (it.x - 4 - w)...(it.x) : (it.x)...(it.x + 4 + w)
      var row = 0
      while row < taken.count, taken[row].contains(where: { $0.overlaps(span) }) { row += 1 }
      if row == taken.count { taken.append([]) }
      taken[row].append(span)
      out.append(Placed(mark: it.mark, x: it.left ? it.x - 4 - w / 2 : it.x + 4 + w / 2, y: atTop ? plot.minY + 10 + CGFloat(row) * 17 : plot.maxY - 12 - CGFloat(row) * 17))
    }
    return out
  }
}

/// The change index: each day (grey points), the trend (pink) and the usual limit (dashed),
/// with context periods shaded. Starts at the first day with a limit.
struct IndexChart: View {
  let records: [DayRecordValue]
  var contexts: [ContextLabelValue] = []
  var marks: [DayMark] = []
  /// Axis labels every month on Trends, every week on the shorter Why? window.
  var stride: Calendar.Component = .month
  var height: CGFloat = 220

  var body: some View {
    let first = records.firstIndex { $0.UCL != nil } ?? records.count
    let shown = Array(records[first...])
    Chart {
      ForEach(contexts.filter { $0.kind == "explains_sensors" }, id: \.id) { c in
        if let s = Clock.date(c.start), let e = Clock.date(c.end) {
          RectangleMark(xStart: .value("Start", s), xEnd: .value("End", e)).foregroundStyle(Theme.magentaTint)
        }
      }
      ForEach(shown, id: \.date) { r in
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
      ForEach(marks, id: \.self) { m in
        if let d = Clock.date(m.date) {
          RuleMark(x: .value("Date", d)).foregroundStyle(m.color).lineStyle(.init(lineWidth: 1.5, dash: [3, 3]))
        }
      }
    }
    .chartXAxis { AxisMarks(values: .stride(by: stride)) { _ in AxisGridLine(); AxisValueLabel(format: stride == .month ? .dateTime.month(.abbreviated) : .dateTime.day().month(.abbreviated)) } }
    // The index sits low until it crosses, so the labels go at the top here.
    .dayMarkLabels(marks, atTop: true)
    .frame(height: height)
    .accessibilityLabel("Change index per day with the smoothed line and your usual range")
  }
}
