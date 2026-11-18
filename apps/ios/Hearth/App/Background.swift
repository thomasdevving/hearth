import BackgroundTasks
import Foundation
import UserNotifications

/// Local notification for a due check-in or questionnaire (docs/02 §7). Never between 23:00
/// and 08:00 (docs/01 §7); the text never says why (docs/04 §7.1).
enum Notifications {
  static let identifier = "hearth.due"

  static func requestPermission() async {
    _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
  }

  @MainActor
  static func scheduleIfDue(store: Store) async {
    let center = UNUserNotificationCenter.current()
    let open = store.openInbox().filter { $0.type == "checkin" || $0.type == "questionnaire" }
    guard let item = open.first else {
      center.removePendingNotificationRequests(withIdentifiers: [identifier])
      return
    }
    // Already told about this item?
    let key = "notified." + item.id
    if UserDefaults.standard.bool(forKey: key) { return }
    let content = UNMutableNotificationContent()
    content.title = "Hearth"
    content.body = item.type == "checkin" ? "Check-in ready. Three quick questions, about 20 seconds." : "Two short questions are waiting."
    content.sound = .default
    let trigger = UNCalendarNotificationTrigger(dateMatching: deliveryTime(after: .now), repeats: false)
    try? await center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
    UserDefaults.standard.set(true, forKey: key)
  }

  /// The first moment outside quiet hours (23:00–08:00), at least a minute from now.
  static func deliveryTime(after now: Date) -> DateComponents {
    let cal = Clock.calendar
    var t = now.addingTimeInterval(60)
    let h = cal.component(.hour, from: t)
    if h >= 23 {
      t = cal.date(bySettingHour: 8, minute: 0, second: 0, of: cal.date(byAdding: .day, value: 1, to: t)!)!
    } else if h < 8 {
      t = cal.date(bySettingHour: 8, minute: 0, second: 0, of: t)!
    }
    return cal.dateComponents([.year, .month, .day, .hour, .minute], from: t)
  }
}

/// Daily update by background refresh (docs/02 §7). iOS decides when it runs; the app also
/// runs the update on every open. With file protection `complete` the store can only be read
/// while the iPhone is unlocked, so a refresh while locked does nothing.
enum BackgroundRefresh {
  static let identifier = "com.thomasdevving.hearth.daily"

  static func register(_ handler: @escaping @MainActor () async -> Void) {
    BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
      schedule()
      let work = Task { @MainActor in
        await handler()
        task.setTaskCompleted(success: true)
      }
      task.expirationHandler = { work.cancel() }
    }
  }

  /// Next run: after 04:00, when yesterday is complete and the watch has usually synced.
  static func schedule() {
    let cal = Clock.calendar
    let next4 = cal.nextDate(after: .now, matching: DateComponents(hour: 4), matchingPolicy: .nextTime) ?? .now.addingTimeInterval(6 * 3600)
    let req = BGAppRefreshTaskRequest(identifier: identifier)
    req.earliestBeginDate = next4
    try? BGTaskScheduler.shared.submit(req)
  }
}
