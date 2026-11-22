import SwiftUI

/// `settings`: where models run, check-in schedule, sensors, support, trusted contact,
/// delete everything.
struct SettingsView: View {
  @Environment(AppModel.self) private var app
  @State private var msg: String?
  @State private var confirmDelete = false

  var body: some View {
    let _ = app.revision
    let s = app.settings
    ScreenScroll(title: "Settings") {
      SectionTitle(text: "Where models run")
      Toggle(isOn: .constant(false)) {
        VStack(alignment: .leading, spacing: 2) {
          Text("Allow the cloud model").font(HearthFont.body(16, weight: "SemiBold"))
          Muted("Not available in this build: no Firebase project is configured.")
        }
      }
      .disabled(true)
      Toggle(isOn: Binding(get: { s.onDeviceEnabled }, set: { s.onDeviceEnabled = $0; app.changed() })) {
        VStack(alignment: .leading, spacing: 2) {
          Text("Use the on-device model").font(HearthFont.body(16, weight: "SemiBold"))
          Muted("Apple Intelligence: \(OnDeviceModel.availability.rawValue). When off, private tasks use simple fallbacks.")
        }
      }
      .tint(Theme.magenta)

      SectionTitle(text: "Check-ins")
      Toggle(isOn: Binding(get: { s.scheduleMode == "fixed" }, set: { s.scheduleMode = $0 ? "fixed" : "triggered"; app.changed() })) {
        VStack(alignment: .leading, spacing: 2) {
          Text("Fixed schedule").font(HearthFont.body(16, weight: "SemiBold"))
          Muted("A check-in every 3 days instead of when your pattern changes.")
        }
      }
      .tint(Theme.magenta)
      Button("Weekly reflection ›") { app.path.append(.weekly) }.buttonStyle(.link)

      SectionTitle(text: "Sensors")
      sensor("Steps", \.sensorSteps)
      sensor("Walking pace", \.sensorWalkingSpeed)
      sensor("Sleep", \.sensorSleep)
      sensor("Heart rate", \.sensorHeart)
      Toggle("Places (visits)", isOn: Binding(get: { s.sensorVisits }, set: { on in
        s.sensorVisits = on
        app.changed()
        if on { Task { _ = await LocationCollector.shared.requestAlways(); LocationCollector.shared.start() } } else { LocationCollector.shared.stop() }
      }))
      .tint(Theme.magenta)
      if !s.healthAuthorized {
        Button("Allow Health access") {
          Task {
            try? await HealthKitCollector.shared.requestAuthorization()
            s.healthAuthorized = true
            app.changed()
            await app.runDaily(reason: "settings")
          }
        }
        .buttonStyle(.secondary)
      }
      Muted("Health access can also be changed in the Health app under Sharing → Apps → Hearth.")

      SectionTitle(text: "Support")
      Picker("Crisis line", selection: Binding(get: { s.country }, set: { s.country = $0; app.changed() })) {
        ForEach(Shared.crisisLines.countries.keys.sorted(), id: \.self) { code in
          Text("\(code) · \(Shared.crisisLines.countries[code]?.name ?? "")").tag(code)
        }
        Text("Other").tag("other")
      }
      .tint(Theme.magenta)
      Button("My people (call a friend) ›") { app.path.append(.people) }.buttonStyle(.link)
      Button("My safety plan ›") { app.safetyEntry = "edit" }.buttonStyle(.link)

      SectionTitle(text: "Your data")
      Button("Delete everything") { confirmDelete = true }
        .buttonStyle(.secondary)
        .foregroundStyle(Theme.danger)
      if let msg { Text(msg).foregroundStyle(Theme.steady) }
      HelpButton()
    }
    .confirmationDialog("Delete everything on this iPhone? This cannot be undone.", isPresented: $confirmDelete, titleVisibility: .visible) {
      Button("Delete everything", role: .destructive) {
        app.store.deleteEverything()
        app.path.removeAll()
        app.changed()
      }
    }
  }

  private func sensor(_ title: String, _ key: ReferenceWritableKeyPath<HearthSettings, Bool>) -> some View {
    let s = app.settings
    return Toggle(title, isOn: Binding(get: { s[keyPath: key] }, set: { s[keyPath: key] = $0; app.changed() })).tint(Theme.magenta)
  }
}
