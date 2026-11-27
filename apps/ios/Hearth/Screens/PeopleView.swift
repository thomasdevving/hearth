import ContactsUI
import SwiftUI

/// "My people": who to call or message on a hard day. Local only (S3). Names and numbers can
/// come from Apple's contact picker, which needs no access to the whole address book.
struct PeopleView: View {
  @Environment(AppModel.self) private var app
  @State private var rows: [People.Draft] = []
  @State private var loaded = false
  @State private var picking: Int?
  @State private var saved = false
  @State private var error: String?

  var body: some View {
    ScreenScroll(title: "My people") {
      Muted("One to three people to call or message on a hard day. Hearth never contacts them.")
      ForEach(rows.indices, id: \.self) { i in
        VStack(alignment: .leading, spacing: 8) {
          Text("Person \(i + 1)").font(HearthFont.body(16, weight: "SemiBold"))
          Button("Choose from contacts") { picking = i }.buttonStyle(.link)
          TextField("Name", text: $rows[i].name).textFieldStyle(.roundedBorder)
          TextField("Phone", text: $rows[i].phone).textFieldStyle(.roundedBorder).keyboardType(.phonePad)
          TextField("Good for (optional): a walk, a chat", text: $rows[i].goodFor).textFieldStyle(.roundedBorder)
          TextArea(label: "Message that opens when you tap “Message”", text: $rows[i].message, minHeight: 60)
          Button("Remove") { rows.remove(at: i) }.buttonStyle(.link)
        }
        .padding(12)
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line))
      }
      if rows.count < People.max {
        Button("Add another person") { rows.append(People.Draft()) }.buttonStyle(.secondary)
      }
      Button("Save on this iPhone") {
        // A number with fewer than 3 digits would show Call and Message buttons that dial nothing.
        if let bad = rows.first(where: { !$0.phone.trimmingCharacters(in: .whitespaces).isEmpty && $0.phone.filter(\.isNumber).count < 3 }) {
          let who = bad.name.trimmingCharacters(in: .whitespaces)
          error = "Check the phone number for \(who.isEmpty ? "this person" : who): it needs at least a few digits."
          saved = false
          return
        }
        error = nil
        People.save(rows, store: app.store); app.changed(); saved = true
      }.buttonStyle(.primary)
      if saved { Text("Saved on this iPhone.").foregroundStyle(Theme.steady) }
      if let error { Text(error).foregroundStyle(Theme.changed) }
    }
    .onAppear {
      guard !loaded else { return }
      loaded = true
      let ps = People.all(app.store)
      rows = ps.isEmpty ? [People.Draft()] : ps.map { People.Draft(name: $0.name, phone: $0.phone, goodFor: $0.goodFor, message: $0.message) }
    }
    .sheet(isPresented: Binding(get: { picking != nil }, set: { if !$0 { picking = nil } })) {
      ContactPicker { name, phone in
        if let i = picking, rows.indices.contains(i) { rows[i].name = name; rows[i].phone = phone }
        picking = nil
      }
      .ignoresSafeArea()
    }
  }
}

/// Apple's contact picker: the user picks one phone number; Hearth sees only that contact.
struct ContactPicker: UIViewControllerRepresentable {
  var onPick: (String, String) -> Void

  func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }
  func makeUIViewController(context: Context) -> CNContactPickerViewController {
    let vc = CNContactPickerViewController()
    vc.displayedPropertyKeys = [CNContactPhoneNumbersKey]
    vc.predicateForSelectionOfProperty = NSPredicate(format: "key == 'phoneNumbers'")
    vc.delegate = context.coordinator
    return vc
  }
  func updateUIViewController(_ vc: CNContactPickerViewController, context: Context) {}

  final class Coordinator: NSObject, CNContactPickerDelegate {
    let onPick: (String, String) -> Void
    init(onPick: @escaping (String, String) -> Void) { self.onPick = onPick }
    func contactPicker(_ picker: CNContactPickerViewController, didSelect property: CNContactProperty) {
      let name = CNContactFormatter.string(from: property.contact, style: .fullName) ?? property.contact.givenName
      let phone = (property.value as? CNPhoneNumber)?.stringValue ?? ""
      onPick(name, phone)
    }
  }
}
