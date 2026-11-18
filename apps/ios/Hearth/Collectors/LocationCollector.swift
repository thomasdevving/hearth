import CoreLocation
import Foundation

/// Place visits from `CLVisit` (docs/03 §5). Needs "Always" location permission; delivers
/// visits in the background; there is no history before install. Locations are class S3: they
/// are written only to the local `day_raw` records and never sent anywhere (R3).
final class LocationCollector: NSObject, CLLocationManagerDelegate, @unchecked Sendable {
  static let shared = LocationCollector()

  private let manager = CLLocationManager()
  /// Called on the main actor with each completed visit.
  var onVisit: (@MainActor (_ arrive: Date, _ depart: Date, _ lat: Double, _ lon: Double) -> Void)?
  private var oneShot: [CheckedContinuation<CLLocationCoordinate2D?, Never>] = []
  private var authWaiters: [CheckedContinuation<CLAuthorizationStatus, Never>] = []

  override init() {
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
  }

  var status: CLAuthorizationStatus { manager.authorizationStatus }

  /// Asks for "When in use" first and then "Always", as iOS requires.
  @MainActor
  func requestAlways() async -> CLAuthorizationStatus {
    if manager.authorizationStatus == .notDetermined {
      _ = await withCheckedContinuation { c in authWaiters.append(c); manager.requestWhenInUseAuthorization() }
    }
    if manager.authorizationStatus == .authorizedWhenInUse {
      manager.requestAlwaysAuthorization()
      // iOS answers "Always" asynchronously and may not ask at once; take what we have.
      try? await Task.sleep(for: .seconds(1))
    }
    return manager.authorizationStatus
  }

  func start() {
    let s = manager.authorizationStatus
    guard s == .authorizedAlways || s == .authorizedWhenInUse else { return }
    manager.startMonitoringVisits()
  }

  func stop() { manager.stopMonitoringVisits() }

  /// One location fix for "I'm here now" when naming a place. Never stored except as a place.
  @MainActor
  func currentCoordinate() async -> CLLocationCoordinate2D? {
    if manager.authorizationStatus == .notDetermined {
      _ = await withCheckedContinuation { c in authWaiters.append(c); manager.requestWhenInUseAuthorization() }
    }
    guard manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse else { return nil }
    return await withCheckedContinuation { c in oneShot.append(c); manager.requestLocation() }
  }

  // CLLocationManagerDelegate -------------------------------------------------------------

  func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
    // Only completed visits: an arrival without a departure has no duration yet.
    guard visit.arrivalDate != .distantPast, visit.departureDate != .distantFuture else { return }
    let a = visit.arrivalDate, d = visit.departureDate, c = visit.coordinate
    Task { @MainActor in self.onVisit?(a, d, c.latitude, c.longitude) }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let s = manager.authorizationStatus
    guard s != .notDetermined else { return }
    let w = authWaiters; authWaiters = []
    w.forEach { $0.resume(returning: s) }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    let w = oneShot; oneShot = []
    w.forEach { $0.resume(returning: locations.last?.coordinate) }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    let w = oneShot; oneShot = []
    w.forEach { $0.resume(returning: nil) }
  }
}
