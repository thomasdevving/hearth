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
