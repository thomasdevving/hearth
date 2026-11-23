import CoreText
import SwiftUI
import UIKit

/// The web app's look (apps/web/src/styles.css): magenta on white, Syne headings, Outfit body.
enum Theme {
  static let magenta = Color(hex: 0xCA026A)
  static let magentaDeep = Color(hex: 0x7A0F55)
  static let magentaTint = Color(hex: 0xFDF0F7)
  static let magentaLine = Color(hex: 0xF3C6DF)
  static let ink = Color(hex: 0x1D1320)
  static let ink2 = Color(hex: 0x4A3F4C)
  static let muted = Color(hex: 0x6E6470)
  static let line = Color(hex: 0xEEE6EC)
  static let surface2 = Color(hex: 0xFAF6F9)
  static let steady = Color(hex: 0x2F7D4F)
  static let changed = Color(hex: 0xB25D00)
  static let learning = Color(hex: 0x6E6470)
  static let danger = Color(hex: 0xB3261E)
  static let radius: CGFloat = 14

  static func stateColor(_ s: EngineStateName) -> Color {
    switch s { case .WARM_UP: return learning; case .MONITOR: return steady; default: return changed }
  }
}

extension Color {
  init(hex: UInt32) {
    self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
  }
}

/// Syne and Outfit from the bundled WOFF2 files (the web app's own font files). Variable
/// fonts: the named instances are picked by PostScript name. Sizes follow Dynamic Type.
enum HearthFont {
  private static let descriptors: [String: CTFontDescriptor] = {
    var out: [String: CTFontDescriptor] = [:]
    for file in ["syne-latin-wght-normal", "outfit-latin-wght-normal"] {
      guard let url = Bundle.main.url(forResource: file, withExtension: "woff2", subdirectory: "Fonts"),
            let data = try? Data(contentsOf: url),
            let ds = CTFontManagerCreateFontDescriptorsFromData(data as CFData) as? [CTFontDescriptor] else { continue }
      for d in ds {
        let f = CTFontCreateWithFontDescriptor(d, 12, nil)
        out[CTFontCopyPostScriptName(f) as String] = d
      }
    }
    return out
  }()

  static func font(_ postScript: String, size: CGFloat, relativeTo style: UIFont.TextStyle, fallback: Font.Weight) -> Font {
    let scaled = UIFontMetrics(forTextStyle: style).scaledValue(for: size)
    guard let d = descriptors[postScript] else { return .system(size: scaled, weight: fallback) }
    return Font(CTFontCreateWithFontDescriptor(d, scaled, nil))
  }

  static func display(_ size: CGFloat, bold: Bool = true) -> Font {
    font(bold ? "Syne-Bold" : "Syne-SemiBold", size: size, relativeTo: .title2, fallback: .bold)
  }
  static func body(_ size: CGFloat = 17, weight: String = "Regular") -> Font {
    let fw: Font.Weight = weight == "Medium" ? .medium : weight == "SemiBold" ? .semibold : weight == "Bold" ? .bold : .regular
    return font("Outfit-Thin_\(weight)", size: size, relativeTo: .body, fallback: fw)
  }
}

// Components ----------------------------------------------------------------------------

struct ScreenTitle: View {
  let text: String
  var badge: String? = nil
  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text(text).font(HearthFont.display(28)).foregroundStyle(Theme.ink)
      if let badge { ModelBadge(ranOn: badge) }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityAddTraits(.isHeader)
  }
}

struct SectionTitle: View {
  let text: String
  var body: some View {
    Text(text).font(HearthFont.display(19)).foregroundStyle(Theme.ink)
      .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 16)
      .accessibilityAddTraits(.isHeader)
  }
}

/// "on-device", "cloud" or "template" on every screen with model-written text (docs/01 §7).
struct ModelBadge: View {
  let ranOn: String
  var body: some View {
    let text = ranOn == "on_device" ? "on-device" : ranOn == "cloud" ? "cloud" : "standard text"
    Text(text)
      .font(HearthFont.body(12, weight: "SemiBold"))
      .padding(.horizontal, 8).padding(.vertical, 3)
      .foregroundStyle(ranOn == "cloud" ? Theme.changed : ranOn == "on_device" ? Theme.magentaDeep : Theme.muted)
      .background(Capsule().fill(ranOn == "on_device" ? Theme.magentaTint : Theme.surface2))
      .overlay(Capsule().stroke(ranOn == "on_device" ? Theme.magentaLine : Theme.line))
      .accessibilityLabel(ranOn == "cloud" ? "Written by the cloud model" : ranOn == "on_device" ? "Written by the model on this device" : "Standard text written by Hearth, no model")
  }
}

struct PrimaryButtonStyle: ButtonStyle {
  @Environment(\.isEnabled) private var enabled
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(HearthFont.body(17, weight: "SemiBold"))
      .foregroundStyle(.white)
      .frame(maxWidth: .infinity, minHeight: 48)
      .padding(.horizontal, 16)
      .background(RoundedRectangle(cornerRadius: 12).fill(enabled ? Theme.magenta : Theme.muted.opacity(0.4)))
      .opacity(configuration.isPressed ? 0.85 : 1)
  }
}

struct SecondaryButtonStyle: ButtonStyle {
  @Environment(\.isEnabled) private var enabled
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(HearthFont.body(17, weight: "Medium"))
      .foregroundStyle(enabled ? Theme.magentaDeep : Theme.muted)
      .frame(maxWidth: .infinity, minHeight: 48)
      .padding(.horizontal, 16)
      .background(RoundedRectangle(cornerRadius: 12).fill(Color.white))
      .overlay(RoundedRectangle(cornerRadius: 12).stroke(enabled ? Theme.magentaLine : Theme.line, lineWidth: 1.5))
      .opacity(configuration.isPressed ? 0.8 : 1)
  }
}

struct LinkButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(HearthFont.body(16, weight: "Medium"))
      .foregroundStyle(Theme.magenta)
      .frame(minHeight: 44)
      .opacity(configuration.isPressed ? 0.6 : 1)
  }
}

extension ButtonStyle where Self == PrimaryButtonStyle { static var primary: PrimaryButtonStyle { .init() } }
extension ButtonStyle where Self == SecondaryButtonStyle { static var secondary: SecondaryButtonStyle { .init() } }
extension ButtonStyle where Self == LinkButtonStyle { static var link: LinkButtonStyle { .init() } }

struct Card<Content: View>: View {
  enum Tone { case accent, warm, plain }
  var tone: Tone = .plain
  @ViewBuilder var content: Content
  var body: some View {
    VStack(alignment: .leading, spacing: 4) { content }
      .font(HearthFont.body(16))
      .foregroundStyle(Theme.ink)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(16)
      .background(RoundedRectangle(cornerRadius: Theme.radius).fill(tone == .accent ? Theme.magentaTint : tone == .warm ? Theme.surface2 : .white))
      .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(tone == .accent ? Theme.magentaLine : Theme.line))
  }
}

/// A selectable chip or scale button.
struct Chip: View {
  let text: String
  let selected: Bool
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Text(text)
        .font(HearthFont.body(15, weight: selected ? "SemiBold" : "Regular"))
        .multilineTextAlignment(.leading)
        .foregroundStyle(selected ? .white : Theme.ink)
        .padding(.horizontal, 14).frame(minHeight: 44)
        .background(Capsule().fill(selected ? Theme.magenta : .white))
        .overlay(Capsule().stroke(selected ? Theme.magenta : Theme.line, lineWidth: 1.5))
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? [.isSelected] : [])
  }
}

/// Wraps chips onto several lines.
struct FlowLayout: Layout {
  var spacing: CGFloat = 8
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? 320
    var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0
    for s in subviews {
      let size = s.sizeThatFits(.init(width: width, height: nil))
      if x > 0 && x + size.width > width { x = 0; y += row + spacing; row = 0 }
      x += size.width + spacing; row = max(row, size.height)
    }
    return CGSize(width: width, height: y + row)
  }
  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
    for s in subviews {
      let size = s.sizeThatFits(.init(width: bounds.width, height: nil))
      if x > bounds.minX && x + size.width > bounds.maxX { x = bounds.minX; y += row + spacing; row = 0 }
      s.place(at: CGPoint(x: x, y: y), proposal: .init(size))
      x += size.width + spacing; row = max(row, size.height)
    }
  }
}

/// A scrolling screen with the standard padding and title.
struct ScreenScroll<Content: View>: View {
  let title: String
  var badge: String? = nil
  /// Where the scroll starts and stays when the content grows (nil: the top, as usual).
  var anchor: UnitPoint? = nil
  @ViewBuilder var content: Content
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        ScreenTitle(text: title, badge: badge)
        content
      }
      .font(HearthFont.body())
      .foregroundStyle(Theme.ink)
      .padding(.horizontal, 20).padding(.vertical, 16)
    }
    .background(Color.white)
    .scrollDismissesKeyboard(.interactively)
    .defaultScrollAnchor(anchor, for: .initialOffset)
    .defaultScrollAnchor(anchor, for: .sizeChanges)
  }
}

struct Muted: View {
  let text: String
  init(_ text: String) { self.text = text }
  var body: some View { Text(text).font(HearthFont.body(15)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true) }
}

/// "I need help now": on home and settings at all times (docs/06 §4.1).
struct HelpButton: View {
  @Environment(AppModel.self) private var app
  var body: some View {
    Button { app.openSafety("button") } label: {
      Text("I need help now")
        .font(HearthFont.body(17, weight: "SemiBold"))
        .foregroundStyle(Theme.danger)
        .frame(maxWidth: .infinity, minHeight: 48)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.danger, lineWidth: 1.5))
    }
    .buttonStyle(.plain)
    .padding(.top, 16)
  }
}

struct TextArea: View {
  let label: String
  @Binding var text: String
  var placeholder: String = ""
  var minHeight: CGFloat = 90
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      if !label.isEmpty { Text(label).font(HearthFont.body(16, weight: "SemiBold")) }
      TextField(placeholder, text: $text, axis: .vertical)
        .font(HearthFont.body(16))
        .lineLimit(3...10)
        .padding(12)
        .frame(minHeight: minHeight, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
        .accessibilityLabel(label.isEmpty ? placeholder : label)
    }
  }
}

/// A section that starts closed, for the parts of a long screen you only need now and then
/// (as `Fold` on the web).
struct Fold<Content: View>: View {
  let title: String
  var hint: String? = nil
  @ViewBuilder var content: Content
  @State private var open = false
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Button { withAnimation(.easeInOut(duration: 0.2)) { open.toggle() } } label: {
        HStack(alignment: .center, spacing: 12) {
          VStack(alignment: .leading, spacing: 2) {
            Text(title).font(HearthFont.display(17)).foregroundStyle(Theme.ink)
            if let hint { Text(hint).font(HearthFont.body(14)).foregroundStyle(Theme.muted) }
          }
          Spacer(minLength: 0)
          Image(systemName: open ? "minus" : "plus").foregroundStyle(Theme.magenta).font(.system(size: 17, weight: .medium))
        }
        .frame(minHeight: 52)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityAddTraits(.isHeader)
      .accessibilityValue(open ? "open" : "closed")
      if open { VStack(alignment: .leading, spacing: 10) { content }.padding(.bottom, 16) }
    }
    .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
  }
}
