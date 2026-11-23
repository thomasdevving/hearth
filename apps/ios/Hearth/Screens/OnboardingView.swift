import SwiftUI

/// First run, as on the web: an animated intro (the mark blooms open, the name, the slogan),
/// then one short screen that says how Hearth works in three illustrated rows. Privacy and what
/// Hearth is not sit behind "Learn more about privacy"; on iPhone this screen also asks for
/// Health access and, optionally, places.
struct OnboardingView: View {
  @Environment(AppModel.self) private var app
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var step: Step = UserDefaults.standard.string(forKey: "HearthOnboardingStep") == "about" ? .about : .intro
  @State private var shown = false
  @State private var asking = false
  @State private var locationOn = false
  @State private var privacyOpen = false
  var onDone: () -> Void

  enum Step { case intro, about }

  var body: some View {
    ZStack {
      Color.white.ignoresSafeArea()
      switch step {
      case .intro: intro.transition(.opacity)
      case .about: about.transition(.opacity)
      }
    }
    .onAppear { appear() }
  }

  // Intro -----------------------------------------------------------------------------------

  private var intro: some View {
    VStack(spacing: 0) {
      Spacer()
      Image("Logo").resizable().scaledToFit().frame(width: 96, height: 96)
        .scaleEffect(shown ? 1 : 0.4).rotationEffect(.degrees(shown ? 0 : -120)).opacity(shown ? 1 : 0)
        .animation(motion(1.1, delay: 0), value: shown)
        .accessibilityHidden(true)
      Text("Hearth").font(HearthFont.display(19)).foregroundStyle(Theme.magenta).padding(.top, 24)
        .modifier(Rise(shown: shown, animation: motion(0.7, delay: 0.45)))
      Text("Notice when your days start to drift.")
        .font(HearthFont.display(36)).foregroundStyle(Theme.ink).multilineTextAlignment(.center)
        .padding(.top, 12).padding(.horizontal, 24)
        .modifier(Rise(shown: shown, animation: motion(0.7, delay: 0.65)))
        .accessibilityAddTraits(.isHeader)
      Button("Start with Hearth") { withAnimation(.easeInOut(duration: 0.35)) { step = .about } }
        .buttonStyle(.primary).frame(maxWidth: 260).padding(.top, 48)
        .modifier(Rise(shown: shown, animation: motion(0.7, delay: 0.95)))
      Spacer()
      Spacer()
    }
    .padding(.horizontal, 20)
  }

  // How Hearth works ------------------------------------------------------------------------

  private var about: some View {
    VStack(alignment: .leading, spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          Image("Logo").resizable().scaledToFit().frame(width: 44, height: 44).accessibilityHidden(true)
          Text("How Hearth works").font(HearthFont.display(30)).foregroundStyle(Theme.ink).padding(.top, 16)
            .accessibilityAddTraits(.isHeader)
          Text("It does three things for you in the background.").font(HearthFont.body(17)).foregroundStyle(Theme.ink2).padding(.top, 6)
          VStack(spacing: 0) {
            row(art: AnyView(UsualArt()), title: "It learns your usual days", text: "Sleep, steps, rhythm, heart rate and places.")
            row(art: AnyView(DriftArt()), title: "It notices when they change", text: "Compared only with you.")
            row(art: AnyView(PlanArt()), title: "It brings back your plan", text: "A short check-in, in your own words.")
          }
          .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
          .padding(.top, 20)

          Toggle(isOn: $locationOn) {
            VStack(alignment: .leading, spacing: 2) {
              Text("Also note the places I visit").font(HearthFont.body(16, weight: "SemiBold"))
              Muted("Only visits, never your route. Needs location “Always”.")
            }
          }
          .tint(Theme.magenta).padding(.top, 20)
        }
        .padding(.horizontal, 20).padding(.top, 24)
      }

      VStack(spacing: 12) {
        DisclosureGroup(isExpanded: $privacyOpen) {
          VStack(alignment: .leading, spacing: 8) {
            privacyLine("Your words are read only by the model on this iPhone.")
            privacyLine("Every model call is listed in the privacy ledger.")
            privacyLine("Hearth is not a diagnosis or a crisis service. “I need help now” works offline.")
            if CloudModel.isConfigured {
              Toggle(isOn: Binding(get: { app.settings.cloudConsent }, set: { app.settings.cloudConsent = $0; app.changed() })) {
                Text("Allow a longer weekly reflection by Gemini in the cloud, from weekly numbers only.").font(HearthFont.body(15))
              }
              .tint(Theme.magenta)
            }
          }
          .padding(.top, 8)
        } label: {
          Label("Learn more about privacy", systemImage: "lock.fill")
            .font(HearthFont.body(16, weight: "Medium")).foregroundStyle(Theme.magentaDeep)
        }
        .tint(Theme.magentaDeep)
        Button(asking ? "One moment…" : "Allow Health access") { Task { await finish() } }
          .buttonStyle(.primary).disabled(asking)
        Muted("Hearth only reads from Health. Nothing leaves this iPhone without your consent.")
          .multilineTextAlignment(.center).frame(maxWidth: .infinity)
      }
      .padding(.horizontal, 20).padding(.vertical, 16)
      .background(Color.white)
      .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }
    .foregroundStyle(Theme.ink)
  }

  private func row(art: AnyView, title: String, text: String) -> some View {
    HStack(alignment: .center, spacing: 14) {
      art.frame(width: 56, height: 38).accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(title).font(HearthFont.display(17)).foregroundStyle(Theme.ink)
        Text(text).font(HearthFont.body(15)).foregroundStyle(Theme.ink2)
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 14)
    .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
    .accessibilityElement(children: .combine)
  }

  private func privacyLine(_ s: String) -> some View {
    HStack(alignment: .top, spacing: 8) {
      Circle().fill(Theme.magenta).frame(width: 5, height: 5).padding(.top, 8)
      Text(s).font(HearthFont.body(15)).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
    }
  }

  // Motion ----------------------------------------------------------------------------------

  private func appear() {
    if reduceMotion { shown = true; return }
    DispatchQueue.main.async { shown = true }
  }

  private func motion(_ duration: Double, delay: Double) -> Animation? {
    reduceMotion ? nil : .timingCurve(0.2, 0.7, 0.2, 1, duration: duration).delay(delay)
  }

  private func finish() async {
    asking = true
    defer { asking = false }
    if HealthKitCollector.isAvailable {
      do {
        try await HealthKitCollector.shared.requestAuthorization()
        app.settings.healthAuthorized = true
      } catch {
        app.settings.healthAuthorized = false
      }
    }
    if locationOn {
      let s = await LocationCollector.shared.requestAlways()
      app.settings.sensorVisits = s == .authorizedAlways || s == .authorizedWhenInUse
      LocationCollector.shared.start()
    }
    app.settings.onboarded = true
    app.changed()
    onDone()
    Task { await app.runDaily(reason: "onboarding") }
  }
}

/// Fades in and rises 14 points, once.
private struct Rise: ViewModifier {
  let shown: Bool
  let animation: Animation?
  func body(content: Content) -> some View {
    content.opacity(shown ? 1 : 0).offset(y: shown ? 0 : 14).animation(animation, value: shown)
  }
}

// The three drawings, in the app's own visual language (the usual band, a drift, your plan). --

private let bandGreen = Color(red: 47 / 255, green: 125 / 255, blue: 79 / 255).opacity(0.16)

private struct UsualArt: View {
  var body: some View {
    Canvas { ctx, size in
      let sx = size.width / 64, sy = size.height / 44
      func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * sx, y: y * sy) }
      var band = Path()
      band.move(to: p(4, 16)); band.addCurve(to: p(34, 15), control1: p(16, 12), control2: p(24, 20))
      band.addCurve(to: p(60, 16), control1: p(44, 10), control2: p(52, 13))
      band.addLine(to: p(60, 30)); band.addCurve(to: p(34, 29), control1: p(52, 27), control2: p(44, 33))
      band.addCurve(to: p(4, 30), control1: p(24, 25), control2: p(16, 26)); band.closeSubpath()
      ctx.fill(band, with: .color(bandGreen))
      var line = Path()
      line.addLines([p(4, 23), p(12, 21), p(20, 25), p(28, 21), p(36, 24), p(44, 20), p(52, 23), p(60, 22)])
      ctx.stroke(line, with: .color(Theme.magenta), style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
    }
  }
}

private struct DriftArt: View {
  var body: some View {
    Canvas { ctx, size in
      let sx = size.width / 64, sy = size.height / 44
      func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * sx, y: y * sy) }
      ctx.fill(Path(CGRect(x: 4 * sx, y: 18 * sy, width: 56 * sx, height: 14 * sy)), with: .color(bandGreen))
      var line = Path()
      line.addLines([p(4, 26), p(14, 24), p(24, 27), p(34, 24), p(42, 19), p(50, 13), p(57, 8)])
      ctx.stroke(line, with: .color(Theme.magenta), style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
      let dot = Path(ellipseIn: CGRect(x: 53 * sx, y: 4 * sy, width: 8 * sx, height: 8 * sy))
      ctx.fill(dot, with: .color(Theme.changed))
      ctx.stroke(dot, with: .color(.white), lineWidth: 1.5)
    }
  }
}

private struct PlanArt: View {
  var body: some View {
    Canvas { ctx, size in
      let sx = size.width / 64, sy = size.height / 44
      let card = Path(roundedRect: CGRect(x: 8 * sx, y: 6 * sy, width: 48 * sx, height: 32 * sy), cornerRadius: 7 * sx)
      ctx.fill(card, with: .color(.white))
      ctx.stroke(card, with: .color(Theme.magentaLine), lineWidth: 1.5)
      ctx.fill(Path(roundedRect: CGRect(x: 15 * sx, y: 14 * sy, width: 24 * sx, height: 3.5 * sy), cornerRadius: 1.75 * sx), with: .color(Theme.ink.opacity(0.75)))
      ctx.fill(Path(roundedRect: CGRect(x: 15 * sx, y: 22 * sy, width: 18 * sx, height: 3 * sy), cornerRadius: 1.5 * sx), with: .color(Theme.muted.opacity(0.5)))
      let tick = Path(ellipseIn: CGRect(x: 40 * sx, y: 16 * sy, width: 12 * sx, height: 12 * sy))
      ctx.fill(tick, with: .color(Theme.magentaTint))
      ctx.stroke(tick, with: .color(Theme.magenta), lineWidth: 1.5)
      var check = Path()
      check.addLines([CGPoint(x: 43.4 * sx, y: 22.2 * sy), CGPoint(x: 45.4 * sx, y: 24.2 * sy), CGPoint(x: 48.8 * sx, y: 20.4 * sy)])
      ctx.stroke(check, with: .color(Theme.magenta), style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
    }
  }
}
