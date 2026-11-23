import FirebaseAppCheck
import FirebaseCore
import Foundation

/// Firebase starts only when `GoogleService-Info.plist` is in the app bundle. It is not in the
/// public repository (R10): put your own copy in `apps/ios/Hearth/` and the synchronized group
/// adds it to the app. Without it the app runs entirely on the device.
///
/// Firebase AI Logic requires App Check. Debug builds and the Simulator use the debug provider
/// (its token is printed in the Xcode console once; register it in the Firebase console, App
/// Check → Apps → Manage debug tokens). Release builds use DeviceCheck.
enum FirebaseSetup {
  static var hasConfig: Bool { Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist") != nil }
  /// True once `FirebaseApp.configure()` has run in this process.
  private(set) static var started = false

  static func start() {
    guard hasConfig, FirebaseApp.app() == nil else { return }
    #if DEBUG || targetEnvironment(simulator)
    AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
    #else
    AppCheck.setAppCheckProviderFactory(DeviceCheckProviderFactory())
    #endif
    FirebaseApp.configure()
    started = true
  }
}
