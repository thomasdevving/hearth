import SwiftUI

/// "For your GP or clinician" on the plan (web: MyPlan.tsx): the plan on one page, or a file
/// their system can read (FHIR). Both are made on this device; the user decides whether and
/// where to share them with the share sheet. Hearth sends nothing.
struct ClinicianFold: View {
  @Environment(AppModel.self) private var app
  var startsOpen = false
  @State private var fhir: URL?

  var body: some View {
    Fold(title: "For your GP or clinician", hint: "One page or a file", startsOpen: startsOpen) {
      Muted("One page, or a file their system can read (FHIR). You decide whether to share it.")
      Button("My plan on one page") { app.path.append(.planPrint) }.buttonStyle(.secondary)
      Group {
        if let fhir {
          ShareLink(item: fhir) { Text("Download for their system") }
        } else {
          Button("Download for their system") {}.disabled(true)
        }
      }
      .buttonStyle(.secondary)
      // The file is written when the fold opens, and again after every change to the plan.
      .task(id: app.revision) { fhir = try? FhirExport.writeFile(app.store) }
    }
  }
}

/// `plan_print`: the plan on one A4 page (web: PlanPrint.tsx), shown as it will print, and the
/// same page as a PDF for the share sheet (print, save to Files, mail). Nothing is sent.
struct PlanPrintView: View {
  @Environment(AppModel.self) private var app
  @State private var pdf: URL?

  var body: some View {
    let _ = app.revision
    let content = PlanPageContent.load(app)
    ScreenScroll(title: "My plan on one page") {
      Muted("For your GP or therapist. Print it or send it yourself; Hearth sends nothing.")
      PDFShareButton(url: pdf, label: "Print or save as PDF", style: .primary)
      PagePreview { PlanPageView(content: content) }
        .padding(.vertical, 8)
        .accessibilityLabel("Preview of the page")
    }
    .task(id: app.revision) {
      pdf = try? ExportFiles.write(A4.pdf(PlanPageView(content: PlanPageContent.load(app)), title: PlanPageContent.title), name: "hearth-plan-\(Clock.today).pdf")
    }
  }
}

/// `share`: a summary for a clinician (web: Share.tsx and Report.tsx). The web makes a private
/// link through the cloud; this build has no cloud store, so the summary is made here, as a
/// PDF or as text, and the user shares it with the share sheet.
struct ShareSummaryView: View {
  @Environment(AppModel.self) private var app
  @State private var pdf: URL?

  var body: some View {
    let _ = app.revision
    let content = SummaryPageContent.load(app.store)
    ScreenScroll(title: "Share with your clinician") {
      if content.rows.isEmpty {
        Muted("No full week of data yet. The summary starts after your first full week.")
      } else {
        Muted("Your last \(content.rows.count) weekly summaries, without notes, places or names. Made on this device; you decide whether to share it.")
        PDFShareButton(url: pdf, label: "Share as PDF", style: .primary)
        ShareLink(item: content.text) { Text("Share as text") }.buttonStyle(.secondary)
        PagePreview { SummaryPageView(content: content) }
          .padding(.vertical, 8)
          .accessibilityLabel("Preview of the summary")
      }
    }
    .task(id: app.revision) {
      let c = SummaryPageContent.load(app.store)
      guard !c.rows.isEmpty else { pdf = nil; return }
      pdf = try? ExportFiles.write(A4.pdf(SummaryPageView(content: c), title: SummaryPageContent.title), name: "hearth-summary-\(Clock.today).pdf")
    }
  }
}

/// A share sheet for a PDF once it is written; until then the same button, disabled.
private struct PDFShareButton: View {
  enum Style { case primary, secondary }
  let url: URL?
  let label: String
  let style: Style

  var body: some View {
    Group {
      if let url {
        ShareLink(item: url, preview: SharePreview(url.deletingPathExtension().lastPathComponent)) { Text(label) }
      } else {
        Button(label) {}.disabled(true)
      }
    }
    .modifier(Styled(style: style))
  }

  private struct Styled: ViewModifier {
    let style: Style
    func body(content: Content) -> some View {
      if style == .primary { content.buttonStyle(.primary) } else { content.buttonStyle(.secondary) }
    }
  }
}
