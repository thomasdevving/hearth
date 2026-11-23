import SwiftUI

/// An A4 sheet in PDF points, and the PDF made from a SwiftUI page with `ImageRenderer`.
enum A4 {
  static let size = CGSize(width: 595.28, height: 841.89)
  /// 14 mm top and bottom, 15 mm left and right, as the web's `.gp-doc`.
  static let padV: CGFloat = 39.69
  static let padH: CGFloat = 42.52
  static var contentWidth: CGFloat { size.width - 2 * padH }

  /// How much a page of this height is shrunk to stay on one sheet (1: not at all).
  static func fit(_ height: CGFloat) -> CGFloat { height > size.height ? size.height / height : 1 }

  /// One A4 page. A page longer than the sheet is shrunk to fit, so it always stays one page.
  @MainActor
  static func pdf<V: View>(_ page: V, title: String) -> Data {
    let renderer = ImageRenderer(content: page.frame(width: size.width).fixedSize(horizontal: false, vertical: true))
    renderer.proposedSize = ProposedViewSize(width: size.width, height: nil)
    let data = NSMutableData()
    renderer.render { s, draw in
      var box = CGRect(origin: .zero, size: size)
      let info: [CFString: Any] = [kCGPDFContextTitle: title, kCGPDFContextCreator: "Hearth"]
      guard let consumer = CGDataConsumer(data: data as CFMutableData),
            let ctx = CGContext(consumer: consumer, mediaBox: &box, info as CFDictionary) else { return }
      ctx.beginPDFPage(nil)
      let scale = min(fit(s.height), size.width / max(s.width, 1))
      // PDF space starts at the bottom left: put the top of the page at the top of the sheet.
      ctx.translateBy(x: (size.width - s.width * scale) / 2, y: size.height - s.height * scale)
      ctx.scaleBy(x: scale, y: scale)
      draw(ctx)
      ctx.endPDFPage()
      ctx.closePDF()
    }
    return data as Data
  }
}

/// The look of the printed documents (web: `.gp-doc` in styles.css): Arial, near-black on
/// white, thin grey rules. Fixed sizes in points; Dynamic Type does not apply to paper.
private enum Doc {
  static let ink = Color(hex: 0x111111)
  static let sub = Color(hex: 0x444444)
  static let how = Color(hex: 0x555555)
  static let rule = Color(hex: 0x999999)
  static let border = Color(hex: 0xBBBBBB)
  static let fill = Color(hex: 0x777777)
  static let head = Color(hex: 0xF0F0F0)
  static let green = Color(hex: 0x2F7D4F)
  static let orange = Color(hex: 0xC77700)
  static let red = Color(hex: 0xB3261E)
  static func font(_ size: CGFloat, bold: Bool = false) -> Font { .custom(bold ? "Arial-BoldMT" : "ArialMT", fixedSize: size) }
}

/// The white sheet with the document's padding and type.
private struct Sheet<Content: View>: View {
  @ViewBuilder var content: Content
  var body: some View {
    VStack(alignment: .leading, spacing: 0) { content }
      .font(Doc.font(10.5))
      .lineSpacing(1.5)
      .foregroundStyle(Doc.ink)
      .padding(.horizontal, A4.padH).padding(.vertical, A4.padV)
      .frame(width: A4.size.width, alignment: .topLeading)
      .background(Color.white)
      .environment(\.colorScheme, .light)
  }
}

private struct DocHeader: View {
  let title: String
  var subtitle: String? = nil
  let fields: [(String, String?)]
  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title).font(Doc.font(17, bold: true))
        if let subtitle { Text(subtitle).font(Doc.font(9.5)).foregroundStyle(Doc.sub) }
      }
      Spacer(minLength: 12)
      Grid(alignment: .leading, horizontalSpacing: 8, verticalSpacing: 3) {
        ForEach(fields.indices, id: \.self) { i in
          GridRow {
            Text(fields[i].0).foregroundStyle(Doc.sub)
            Group {
              if let v = fields[i].1 { Text(v) } else {
                // Left blank, to be written by hand.
                Color.clear.frame(height: 13).overlay(alignment: .bottom) { Rectangle().fill(Doc.fill).frame(height: 0.75) }
              }
            }
            .frame(width: 127.56, alignment: .leading)  // 45 mm
          }
        }
      }
      .font(Doc.font(9.5))
    }
    .padding(.bottom, 8)
    .overlay(alignment: .bottom) { Rectangle().fill(Doc.ink).frame(height: 2) }
  }
}

private struct DocSection<Content: View>: View {
  let title: String
  @ViewBuilder var content: Content
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title).font(Doc.font(11.5, bold: true))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 2)
        .overlay(alignment: .bottom) { Rectangle().fill(Doc.rule).frame(height: 0.75) }
        .accessibilityAddTraits(.isHeader)
      content
    }
    .padding(.top, 12)
  }
}

/// A table cell with collapsed borders: each cell draws its right and bottom line, the table
/// its top and left line.
private struct Cell<Content: View>: View {
  let width: CGFloat
  var header = false
  var bar: Color? = nil
  var size: CGFloat = 9.5
  @ViewBuilder var content: Content
  var body: some View {
    VStack(alignment: .leading, spacing: 3) { content }
      .font(Doc.font(size, bold: header))
      .padding(.vertical, 4).padding(.horizontal, size < 9 ? 4 : 6)
      .padding(.leading, bar == nil ? 0 : 4)
      .frame(width: width, alignment: .topLeading)
      .frame(maxHeight: .infinity, alignment: .topLeading)
      .background(header ? Doc.head : Color.white)
      .overlay(alignment: .trailing) { Rectangle().fill(Doc.border).frame(width: 0.75) }
      .overlay(alignment: .bottom) { Rectangle().fill(Doc.border).frame(height: 0.75) }
      .overlay(alignment: .leading) { if let bar { Rectangle().fill(bar).frame(width: 5) } }
  }
}

private struct TableRow<Content: View>: View {
  @ViewBuilder var content: Content
  var body: some View { HStack(spacing: 0) { content }.fixedSize(horizontal: false, vertical: true) }
}

private extension View {
  func tableFrame() -> some View {
    overlay(alignment: .top) { Rectangle().fill(Doc.border).frame(height: 0.75) }
      .overlay(alignment: .leading) { Rectangle().fill(Doc.border).frame(width: 0.75) }
  }
}

private struct Bullets: View {
  let items: [PlanPageContent.Bullet]
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      ForEach(items.indices, id: \.self) { i in
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text("•")
          VStack(alignment: .leading, spacing: 1) {
            Text(items[i].text).fixedSize(horizontal: false, vertical: true)
            if let how = items[i].how { Text(how).font(Doc.font(8.5)).foregroundStyle(Doc.how).fixedSize(horizontal: false, vertical: true) }
          }
        }
      }
    }
  }
}

/// The plan on one A4 page for the GP or therapist (web: screens/PlanPrint.tsx), laid out by
/// phase as GGZ plans are: Stable, Early signs, Crisis, with signs, own actions and what others
/// can do. Text only from the store and from code; no model writes any of it.
struct PlanPageView: View {
  let content: PlanPageContent

  // 13 % for the phase, 40 % for the signs, the rest split.
  private static let w = A4.contentWidth
  private static let cols: [CGFloat] = [w * 0.13, w * 0.40, w * 0.235, w * 0.235]
  private static let qCols: [CGFloat] = [78, 82, 56, w - 78 - 82 - 56]

  var body: some View {
    let c = content
    let col = Self.cols
    Sheet {
      DocHeader(title: PlanPageContent.title, subtitle: PlanPageContent.subtitle, fields: [("Name", nil), ("Date of birth", nil), ("Date", c.date)])

      DocSection(title: "1. Current status") {
        ForEach(c.status, id: \.self) { Text($0).fixedSize(horizontal: false, vertical: true) }
      }

      DocSection(title: "2. Plan by phase") {
        VStack(alignment: .leading, spacing: 0) {
          TableRow {
            Cell(width: col[0], header: true) { Text("Phase") }
            Cell(width: col[1], header: true) { Text("Signs") }
            Cell(width: col[2], header: true) { Text("What I do") }
            Cell(width: col[3], header: true) { Text("What others can do") }
          }
          TableRow {
            Cell(width: col[0], bar: Doc.green) { Text("Stable").font(Doc.font(9.5, bold: true)) }
            Cell(width: col[1]) { Text(c.stableSigns) }
            Cell(width: col[2]) { Text(c.stableDo) }
            Cell(width: col[3]) { Text(c.stableOthers) }
          }
          TableRow {
            Cell(width: col[0], bar: Doc.orange) { Text("Early signs").font(Doc.font(9.5, bold: true)) }
            Cell(width: col[1]) {
              if c.earlySigns.isEmpty { Text("No personal signs written yet.") } else { Bullets(items: c.earlySigns) }
            }
            Cell(width: col[2]) {
              if c.earlyDo.isEmpty { Text("Nothing written yet.") } else { Bullets(items: c.earlyDo) }
              Text(c.earlyDoNote).font(Doc.font(8.5)).foregroundStyle(Doc.how)
            }
            Cell(width: col[3]) {
              if c.earlyOthers.isEmpty { Text("–") } else { Bullets(items: c.earlyOthers.map { .init(text: $0) }) }
            }
          }
          TableRow {
            Cell(width: col[0], bar: Doc.red) { Text("Crisis").font(Doc.font(9.5, bold: true)) }
            Cell(width: col[1]) { Text(c.crisisSigns) }
            Cell(width: col[2]) { ForEach(c.crisisDo, id: \.self) { Text($0) } }
            Cell(width: col[3]) { ForEach(c.crisisOthers, id: \.self) { Text($0) } }
          }
        }
        .tableFrame()
      }

      DocSection(title: "3. Questionnaires") {
        if c.questionnaires.isEmpty {
          Text("None yet.")
        } else {
          let q = Self.qCols
          VStack(alignment: .leading, spacing: 0) {
            TableRow {
              Cell(width: q[0], header: true) { Text("Date") }
              Cell(width: q[1], header: true) { Text("Questionnaire") }
              Cell(width: q[2], header: true) { Text("Score") }
              Cell(width: q[3], header: true) { Text("Note") }
            }
            ForEach(c.questionnaires.indices, id: \.self) { i in
              let r = c.questionnaires[i]
              TableRow {
                Cell(width: q[0]) { Text(r.date) }
                Cell(width: q[1]) { Text(r.name) }
                Cell(width: q[2]) { Text(r.score) }
                Cell(width: q[3]) { Text(r.note) }
              }
            }
          }
          .tableFrame()
        }
      }

      DocFooter(text: c.footer)
    }
  }
}

private struct DocFooter: View {
  let text: String
  var body: some View {
    (Text("About this document.").font(Doc.font(8.5, bold: true)) + Text(" \(text)"))
      .font(Doc.font(8.5))
      .foregroundStyle(Doc.sub)
      .fixedSize(horizontal: false, vertical: true)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.top, 6)
      .overlay(alignment: .top) { Rectangle().fill(Doc.rule).frame(height: 0.75) }
      .padding(.top, 12)
  }
}

/// The summary for a clinician on one A4 page: the weekly numbers the web's shared summary
/// shows (web: screens/Report.tsx). Weekly numbers only (S1).
struct SummaryPageView: View {
  let content: SummaryPageContent

  private static let cols: [CGFloat] = {
    let fixed: [CGFloat] = [46, 30, 36, 46, 112, 42, 34, 38]
    return fixed + [A4.contentWidth - fixed.reduce(0, +)]
  }()

  var body: some View {
    let c = content
    let col = Self.cols
    Sheet {
      DocHeader(title: SummaryPageContent.title, fields: [("Date", c.date)])
      Text(SummaryPageContent.intro).foregroundStyle(Doc.sub).fixedSize(horizontal: false, vertical: true).padding(.top, 10)
      DocSection(title: "Weekly data") {
        if c.rows.isEmpty {
          Text("No full week of data yet.")
        } else {
          VStack(alignment: .leading, spacing: 0) {
            TableRow {
              ForEach(SummaryPageContent.columns.indices, id: \.self) { i in
                Cell(width: col[i], header: true, size: 8.5) { Text(SummaryPageContent.columns[i]) }
              }
            }
            ForEach(c.rows.indices, id: \.self) { i in
              let r = c.rows[i]
              let values = [r.week, r.days, r.index, r.changedDays, r.signals, r.down, r.phq2, r.phq9, r.context]
              TableRow {
                ForEach(values.indices, id: \.self) { j in
                  Cell(width: col[j], size: 8.5) { Text(values[j]).fixedSize(horizontal: false, vertical: true) }
                }
              }
            }
          }
          .tableFrame()
        }
      }
      DocFooter(text: c.footer)
    }
  }
}

/// A page as it will print: the A4 sheet scaled to the screen's width (and shrunk like the PDF
/// when it runs over one sheet).
struct PagePreview<Page: View>: View {
  @ViewBuilder var page: Page
  @State private var height = A4.size.height

  var body: some View {
    GeometryReader { g in
      let s = g.size.width / A4.size.width
      page
        .fixedSize(horizontal: false, vertical: true)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
        .scaleEffect(A4.fit(height), anchor: .top)
        .frame(width: A4.size.width, height: A4.size.height, alignment: .top)
        .background(Color.white)
        .clipped()
        .scaleEffect(s, anchor: .topLeading)
    }
    .aspectRatio(A4.size.width / A4.size.height, contentMode: .fit)
    .overlay(Rectangle().stroke(Theme.line))
    .shadow(color: .black.opacity(0.08), radius: 8, y: 4)
    .accessibilityElement(children: .contain)
  }
}
