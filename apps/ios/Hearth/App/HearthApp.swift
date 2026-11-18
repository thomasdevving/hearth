import SwiftData
import SwiftUI

@main
struct HearthApp: App {
  @Environment(\.scenePhase) private var phase
  private let container: ModelContainer
  @State private var app: AppModel

  init() {
    let container: ModelContainer
    do { container = try Store.makeContainer() } catch { fatalError("Store failed: \(error)") }
    self.container = container
    let model = AppModel(store: Store(context: container.mainContext))
    _app = State(initialValue: model)
    #if DEBUG
    if DemoData.enabled { model.settings.onboarded = true }
    if UserDefaults.standard.string(forKey: "HearthTab") == "trends" { model.selectedTab = .trends }
    #endif
    Self.startCollectors(model)
  }

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(app)
        .preferredColorScheme(.light)
        .tint(Theme.magenta)
    }
    .modelContainer(container)
    .onChange(of: phase) { _, now in
      if now == .active { Task { await app.runDaily(reason: "open") } }
    }
  }

  /// HealthKit observer queries and CLVisit monitoring feed the same daily loop.
  @MainActor
  private static func startCollectors(_ app: AppModel) {
    if app.settings.healthAuthorized {
      HealthKitCollector.shared.startObserving { @MainActor in await app.runDaily(reason: "healthkit") }
    }
    LocationCollector.shared.onVisit = { a, d, lat, lon in app.addVisit(arrive: a, depart: d, lat: lat, lon: lon) }
    if app.settings.sensorVisits { LocationCollector.shared.start() }
  }
}

struct RootView: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    @Bindable var app = app
    let _ = app.revision
    if !app.settings.onboarded {
      OnboardingView {
        HealthKitCollector.shared.startObserving { @MainActor in await app.runDaily(reason: "healthkit") }
      }
    } else {
      TabView(selection: $app.selectedTab) {
        NavigationStack { HomeView() }
          .tabItem { Label("Today", systemImage: "sun.max") }.tag(AppModel.Tab.today)
        NavigationStack { TrendsView() }
          .tabItem { Label("Trends", systemImage: "chart.xyaxis.line") }.tag(AppModel.Tab.trends)
      }
    }
  }
}
