import SwiftUI

/// `onboarding` (docs/01 §4): what is measured, the on-device promise, false positives, what
/// Hearth is not; then the Health and location permissions. Cloud consent is a separate,
/// optional switch (not available in this build).
struct OnboardingView: View {
  @Environment(AppModel.self) private var app
  @State private var page = 0
  @State private var asking = false
  @State private var locationOn = false
  var onDone: () -> Void

  var body: some View {
    ScreenScroll(title: "Welcome to Hearth") {
      Group {
        switch page {
        case 0:
          Image("Logo").resizable().scaledToFit().frame(width: 72, height: 72).accessibilityHidden(true)
          Text("Hearth notices when your days start to drift, and shows you your own plan.")
            .font(HearthFont.body(20, weight: "Medium"))
          bullet("It learns your usual days from sleep, steps, daily rhythm, heart rate and the places you go.")
          bullet("It compares you only with yourself, never with other people.")
          bullet("When something changes for a few days, it asks how you are and opens your plan.")
        case 1:
          SectionTitle(text: "Your words stay on this device")
          Text("Your plan, notes and answers are read only by the model on this device. The privacy ledger shows every model call.")
          SectionTitle(text: "It takes your holidays into account")
          Text("Going away or having visitors changes your days. Tell Hearth, and those days are set aside. Now and then it may still ask when nothing is wrong, and that's fine: some check-ins are random on purpose.")
        default:
          SectionTitle(text: "What Hearth is not")
          Text("Not a diagnosis and not a crisis service. Nobody watches your data. “I need help now” shows support lines, even offline.")
          SectionTitle(text: "Health and places")
          Text("Hearth reads your steps, walking pace, sleep and heart rate from Health, about four months back, so it knows your usual days from the start. It only reads; nothing leaves this iPhone.")
          Toggle(isOn: $locationOn) {
            VStack(alignment: .leading, spacing: 2) {
              Text("Also note the places I visit").font(HearthFont.body(16, weight: "SemiBold"))
              Muted("Needs location “Always”. Only visits, never your route. Locations never leave this iPhone.")
            }
          }
          .tint(Theme.magenta)
          SectionTitle(text: "Optional: the cloud model")
          Toggle(isOn: .constant(false)) {
            VStack(alignment: .leading, spacing: 2) {
              Text("A longer weekly reflection by Gemini in the cloud, from weekly numbers only. Off by default.")
              Muted("Not available in this build.")
            }
          }
          .disabled(true)
        }
      }
      .fixedSize(horizontal: false, vertical: true)

      HStack(spacing: 12) {
        if page > 0 { Button("Back") { page -= 1 }.buttonStyle(.secondary) }
        if page < 2 {
          Button("Next") { page += 1 }.buttonStyle(.primary)
        } else {
          Button(asking ? "One moment…" : "Allow Health access") { Task { await finish() } }
            .buttonStyle(.primary).disabled(asking)
        }
      }
      .padding(.top, 12)
      Muted("Step \(page + 1) of 3").frame(maxWidth: .infinity)
    }
  }

  private func bullet(_ s: String) -> some View {
    HStack(alignment: .top, spacing: 10) {
      Circle().fill(Theme.magenta).frame(width: 6, height: 6).padding(.top, 9)
      Text(s)
    }
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
