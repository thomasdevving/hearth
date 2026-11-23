import Foundation
import SwiftData

/// Access to the local collections (docs/07 §2), used on the main actor.
@MainActor
final class Store {
  let context: ModelContext

  init(context: ModelContext) { self.context = context }

  /// The SwiftData container in Application Support/Hearth, a folder with file protection
  /// `complete`: the files cannot be read while the iPhone is locked (docs/02 §3).
  static func makeContainer(inMemory: Bool = false) throws -> ModelContainer {
    let schema = Schema(HearthSchema.models)
    if inMemory {
      return try ModelContainer(for: schema, configurations: ModelConfiguration(schema: schema, isStoredInMemoryOnly: true))
    }
    let fm = FileManager.default
    let dir = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      .appendingPathComponent("Hearth", isDirectory: true)
    try fm.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
    try? fm.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: dir.path)
    let url = dir.appendingPathComponent("hearth.store")
    return try ModelContainer(for: schema, configurations: ModelConfiguration(schema: schema, url: url))
  }

  func save() { try? context.save() }

  // Generic helpers ---------------------------------------------------------------------

  func all<T: PersistentModel>(_ type: T.Type, sort: [SortDescriptor<T>] = []) -> [T] {
    (try? context.fetch(FetchDescriptor<T>(sortBy: sort))) ?? []
  }

  func first<T: PersistentModel>(_ type: T.Type, where predicate: Predicate<T>) -> T? {
    var d = FetchDescriptor<T>(predicate: predicate)
    d.fetchLimit = 1
    return (try? context.fetch(d))?.first
  }

  // Settings ----------------------------------------------------------------------------

  var settings: HearthSettings {
    if let s = all(HearthSettings.self).first { return s }
    let s = HearthSettings()
    if let region = Locale.current.region?.identifier, Shared.crisisLines.countries[region] != nil { s.country = region }
    context.insert(s)
    save()
    return s
  }

  // Day raws and records ---------------------------------------------------------------

  func raw(_ date: String) -> DayRaw? { first(DayRaw.self, where: #Predicate { $0.date == date }) }

  func raws(from: String, to: String) -> [DayRaw] {
    let d = FetchDescriptor<DayRaw>(predicate: #Predicate { $0.date >= from && $0.date <= to }, sortBy: [SortDescriptor(\.date)])
    return (try? context.fetch(d)) ?? []
  }

  func records() -> [DayRecord] { all(DayRecord.self, sort: [SortDescriptor(\.date)]) }

  func record(_ date: String) -> DayRecord? { first(DayRecord.self, where: #Predicate { $0.date == date }) }

  var engineState: EngineState? { all(EngineState.self).first }

  func putEngineState(_ json: String) {
    if let s = engineState { s.json = json } else { context.insert(EngineState(json: json)) }
  }

  // Plan ---------------------------------------------------------------------------------

  func activeRules() -> [PlanRuleValue] { all(PlanRule.self).compactMap(\.value).filter(\.active) }
  func activeItems() -> [PersonalItemValue] { all(PersonalItem.self).compactMap(\.value).filter(\.active) }
  /// In a stable order (by id, as the web's store lists them), so the plan does not reshuffle.
  func activeActions() -> [PlanActionValue] { all(PlanAction.self, sort: [SortDescriptor(\.id)]).compactMap(\.value).filter(\.active) }

  // Inbox ----------------------------------------------------------------------------------

  func openInbox() -> [InboxItem] {
    let d = FetchDescriptor<InboxItem>(predicate: #Predicate { $0.status == "open" }, sortBy: [SortDescriptor(\.date)])
    return (try? context.fetch(d)) ?? []
  }

  @discardableResult
  func addInbox(_ type: String, date: String, configure: (InboxItem) -> Void = { _ in }) -> InboxItem {
    let item = InboxItem(id: newId("inbox"), date: date, type: type)
    configure(item)
    context.insert(item)
    return item
  }

  func close(_ item: InboxItem, _ status: String = "done") { item.status = status }

  // Delete everything (docs/07 §2) -------------------------------------------------------

  func deleteEverything() {
    for t in HearthSchema.models { try? context.delete(model: t) }
    save()
  }
}

func newId(_ prefix: String) -> String { "\(prefix)_\(UUID().uuidString.lowercased().prefix(13))" }

/// Local calendar dates and ISO timestamps with offset (AGENTS.md §3 "Dates").
enum Clock {
  static var calendar: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = .current; return c }

  private static func formatter(_ format: String) -> DateFormatter {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.calendar = Calendar(identifier: .gregorian)
    f.timeZone = .current
    f.dateFormat = format
    return f
  }
  private static let dayF = formatter("yyyy-MM-dd")
  private static let stampF = formatter("yyyy-MM-dd'T'HH:mm:ssxxx")

  static func day(_ d: Date) -> String { dayF.timeZone = .current; return dayF.string(from: d) }
  static func stamp(_ d: Date) -> String { stampF.timeZone = .current; return stampF.string(from: d) }
  static func date(_ day: String) -> Date? { dayF.timeZone = .current; return dayF.date(from: day) }
  static var today: String { day(.now) }
  static var nowStamp: String { stamp(.now) }

  static func addDays(_ day: String, _ n: Int) -> String {
    guard let d = date(day), let r = calendar.date(byAdding: .day, value: n, to: d) else { return day }
    return self.day(r)
  }
  static func startOfDay(_ day: String) -> Date { calendar.startOfDay(for: date(day) ?? .now) }

  static func pretty(_ day: String) -> String {
    guard let d = date(day) else { return day }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_GB")
    f.dateFormat = "EEE d MMM"
    return f.string(from: d)
  }
}
