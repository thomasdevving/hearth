import Foundation

/// "Call a friend" (docs/DECISIONS.md, 2026-11-22): the people the user chose, stored locally
/// (S3). Hearth never calls or sends anything; the links open the phone or Messages.
enum People {
  static let max = 3
  static let defaultMessage = "Hey, I'm having a bit of a hard time. Fancy a call or a walk soon?"

  struct Draft: Hashable {
    var name = ""
    var phone = ""
    var goodFor = ""
    var message = People.defaultMessage
  }

  @MainActor
  static func all(_ store: Store) -> [Person] {
    store.all(Person.self, sort: [SortDescriptor(\.order)])
  }

  @MainActor
  static func save(_ drafts: [Draft], store: Store) {
    for p in store.all(Person.self) { store.context.delete(p) }
    for (i, d) in drafts.filter({ !$0.phone.trimmingCharacters(in: .whitespaces).isEmpty }).prefix(max).enumerated() {
      let msg = d.message.trimmingCharacters(in: .whitespacesAndNewlines)
      store.context.insert(Person(id: newId("person"), order: i, name: d.name, phone: d.phone, goodFor: d.goodFor, message: msg.isEmpty ? defaultMessage : msg))
    }
    store.save()
  }

  /// The old single trusted contact becomes the first person, once.
  @MainActor
  static func migrateTrustedContact(_ store: Store) {
    guard store.all(Person.self).isEmpty, let c = store.all(TrustedContact.self).first, !c.phone.isEmpty else { return }
    store.context.insert(Person(id: newId("person"), order: 0, name: c.name, phone: c.phone, goodFor: "", message: defaultMessage))
    store.context.delete(c)
    store.save()
  }

  static func digits(_ phone: String) -> String { phone.filter { $0.isNumber || $0 == "+" } }
  static func telURL(_ p: Person) -> URL? { URL(string: "tel:\(digits(p.phone))") }
  /// `sms:<number>&body=…` opens Messages with the text filled in; the user presses send.
  static func smsURL(_ p: Person) -> URL? {
    let body = (p.message.isEmpty ? defaultMessage : p.message).addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: " -_.!~*'()"))) ?? ""
    return URL(string: "sms:\(digits(p.phone))&body=\(body.replacingOccurrences(of: " ", with: "%20"))")
  }
}
