import SwiftData
import SwiftUI

@main
struct HearthApp: App {
  @Environment(\.scenePhase) private var phase
  private let container: ModelContainer
  @State private var app: AppModel

  init() {
    // Firebase first, so App Check is set up before any cloud-capable model call.
    FirebaseSetup.start()
    let container: ModelContainer
    do { container = try Store.makeContainer() } catch { fatalError("Store failed: \(error)") }
    self.container = container
    let model = AppModel(store: Store(context: container.mainContext))
    _app = State(initialValue: model)
    #if DEBUG
    if DemoData.enabled {
      model.settings.onboarded = true
      if UserDefaults.standard.bool(forKey: "HearthDemoPlanned") { model.settings.planDone = true; model.settings.baselineDone = true }
    }
    switch UserDefaults.standard.string(forKey: "HearthTab") {
    case "trends": model.selectedTab = .trends
    case "plan": model.selectedTab = .plan
    case "ledger": model.selectedTab = .ledger
    case "settings": model.selectedTab = .settings
    default: break
    }
    if DemoData.change { DemoData.addRule(store: model.store) }
    if DemoData.enabled && UserDefaults.standard.bool(forKey: "HearthDemoActions") { DemoData.addActions(store: model.store) }
    if DemoData.helped { DemoData.addHelped(store: model.store) }
    if DemoData.gp { DemoData.addGP(store: model.store) }
    if DemoData.note { DemoData.addNotes(store: model.store) }
    if DemoData.enabled && UserDefaults.standard.bool(forKey: "HearthDemoConsent") { model.settings.cloudConsent = true }
    // `-HearthRoute why:rest_midpoint` opens that screen on top of the tab; `helped_new` the
    // "What helped" screen; `checkin` a new random check-in; `plan_print` the plan on one page;
    // `share` the summary for a clinician; `weekly` the weekly reflection; `science` the
    // science page; `plan_setup` the plan form; `context_confirm` a holiday found in a note.
    switch UserDefaults.standard.string(forKey: "HearthRoute") {
    case let r? where r.hasPrefix("why:"): model.path = [.why(String(r.dropFirst(4)))]
    case "helped_new": model.path = [.helpedNew(nil)]
    case "plan_print": model.path = [.planPrint]
    case "share": model.path = [.share]
    case "weekly": model.path = [.weekly]
    case "science": model.path = [.science]
    case "plan_setup": model.path = [.planSetup(first: false)]
    case "context_confirm":
      DemoData.addContextConfirm(store: model.store)
      if let id = model.store.openInbox().last(where: { $0.type == "context_confirm" })?.id { model.path = [.contextConfirm(id)] }
    case "checkin":
      model.createCheckin(kind: "random", reasons: [], date: Clock.today)
      if let id = model.store.openInbox().last(where: { $0.type == "checkin" })?.checkinId { model.path = [.checkin(id)] }
    default: break
    }
    if CloudCheck.requested { Task { await CloudCheck.run() } }
    #endif
    People.migrateTrustedContact(model.store)
    Self.startCollectors(model)
    // Daily update by background refresh (docs/02 §7); also on every open (below).
    BackgroundRefresh.register { @MainActor in await model.runDaily(reason: "background") }
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
      if now == .background { BackgroundRefresh.schedule() }
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

/// First run: onboarding → plan_setup → baseline_phq → home (docs/01 §6.1). Then tabs.
/// The safety screen covers everything whenever it is opened (R7).
struct RootView: View {
  @Environment(AppModel.self) private var app

  var body: some View {
    @Bindable var app = app
    let _ = app.revision
    Group {
      if !app.settings.onboarded {
        OnboardingView {
          HealthKitCollector.shared.startObserving { @MainActor in await app.runDaily(reason: "healthkit") }
          Task { await Notifications.requestPermission() }
        }
      } else if !app.settings.planDone || !app.settings.baselineDone {
        NavigationStack(path: $app.path) {
          Group {
            if app.settings.planDone { BaselinePhqView() } else { PlanSetupView(first: true) }
          }
          .navigationDestination(for: Route.self) { destination($0) }
        }
      } else {
        TabView(selection: $app.selectedTab) {
          stack { HomeView() }.tabItem { Label("Today", systemImage: "sun.max") }.tag(AppModel.Tab.today)
          stack { TrendsView() }.tabItem { Label("Trends", systemImage: "chart.xyaxis.line") }.tag(AppModel.Tab.trends)
          stack { MyPlanView() }.tabItem { Label("Plan", systemImage: "list.bullet.rectangle") }.tag(AppModel.Tab.plan)
          stack { LedgerView() }.tabItem { Label("Privacy", systemImage: "lock.shield") }.tag(AppModel.Tab.ledger)
          stack { SettingsView() }.tabItem { Label("Settings", systemImage: "gearshape") }.tag(AppModel.Tab.settings)
        }
        .onChange(of: app.selectedTab) { _, _ in app.path.removeAll() }
      }
    }
    .fullScreenCover(isPresented: Binding(get: { app.safetyEntry != nil }, set: { if !$0 { app.safetyEntry = nil } })) {
      SafetyView(startEditing: app.safetyEntry == "edit") { app.safetyEntry = nil }
        .environment(app)
    }
  }

  private func stack<V: View>(@ViewBuilder _ root: () -> V) -> some View {
    @Bindable var app = app
    return NavigationStack(path: $app.path) {
      root().navigationDestination(for: Route.self) { destination($0) }
    }
  }

  @ViewBuilder private func destination(_ r: Route) -> some View {
    switch r {
    case .checkin(let id): CheckinView(id: id)
    case .questionnaire(let inst): QuestionnaireView(instrument: inst)
    case .result(let id, let baseline): ResultView(id: id, baseline: baseline)
    case .contextConfirm(let id): ContextConfirmView(inboxId: id)
    case .planSetup(let first): PlanSetupView(first: first)
    case .myPlan: MyPlanView()
    case .baselinePhq: BaselinePhqView()
    case .weekly: WeeklyView()
    case .people: PeopleView()
    case .why(let feature): WhyView(feature: feature)
    case .helpedNew(let sign): HelpedNewView(sign: sign)
    case .planPrint: PlanPrintView()
    case .share: ShareSummaryView()
    case .science: ScienceView()
    }
  }
}
