import PhotosUI
import SwiftUI
import UIKit

/// "Scan a paper plan" in plan setup (web: PlanSetup.tsx `ScanPlan`, task G2). A photo from
/// the camera or the library is read on this device; the text is handed to the plan field
/// for the user to check. The photo is not kept.
struct ScanPlanButton: View {
  @Environment(AppModel.self) private var app
  let onText: (String) -> Void
  @State private var phase: Phase = .idle
  @State private var choose = false
  @State private var showLibrary = false
  @State private var showCamera = false
  @State private var item: PhotosPickerItem?

  enum Phase { case idle, reading, done, failed }

  #if DEBUG
  /// `-HearthScanDemo YES` reads a generated photo of a written plan on appear (screenshots).
  private static var demo: Bool { UserDefaults.standard.bool(forKey: "HearthScanDemo") }
  #else
  private static let demo = false
  #endif

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Button { choose = true } label: { Label("Scan a paper plan", systemImage: "camera") }
        .buttonStyle(.compact)
        .disabled(phase == .reading)
      switch phase {
      case .reading: Muted("Reading the photo on this device…")
      case .done: Muted("Check the text above and correct it before making cards. The photo was not kept.")
      case .failed: Muted("The photo could not be read on this device. Please type the plan instead.")
      case .idle: EmptyView()
      }
    }
    .confirmationDialog("Scan a paper plan", isPresented: $choose) {
      if UIImagePickerController.isSourceTypeAvailable(.camera) { Button("Take a photo") { showCamera = true } }
      Button("Choose a photo") { showLibrary = true }
    }
    .photosPicker(isPresented: $showLibrary, selection: $item, matching: .images)
    .fullScreenCover(isPresented: $showCamera) {
      CameraPicker { image in showCamera = false; if let image { Task { await read(image) } } }.ignoresSafeArea()
    }
    .onChange(of: item) { _, new in
      guard let new else { return }
      item = nil
      Task {
        phase = .reading
        let data = try? await new.loadTransferable(type: Data.self)
        if let data, let image = UIImage(data: data) { await read(image) } else { phase = .failed }
      }
    }
    .task {
      #if DEBUG
      if Self.demo && phase == .idle { await read(Self.demoImage()) }
      #endif
    }
  }

  private func read(_ image: UIImage) async {
    phase = .reading
    guard let cg = image.cgImage, let lines = try? await PlanScan.recognize(cg, orientation: CGImagePropertyOrientation(image.imageOrientation)),
          let out = await app.transcribePlan(lines: lines) else {
      phase = .failed
      return
    }
    onText(out.text)
    phase = .done
  }

  #if DEBUG
  /// A photo-like page with a written plan, for the Simulator (no camera there).
  static func demoImage() -> UIImage {
    let size = CGSize(width: 900, height: 700)
    return UIGraphicsImageRenderer(size: size).image { ctx in
      UIColor(white: 0.96, alpha: 1).setFill()
      ctx.fill(CGRect(origin: .zero, size: size))
      let lines = ["My early warning signs", "I go to bed later and later", "I stop going to the gym", "I stop replying to messages", "What helps: calling my sister"]
      for (i, l) in lines.enumerated() {
        let font = UIFont(name: "Noteworthy-Bold", size: i == 0 ? 46 : 40) ?? .systemFont(ofSize: 40)
        (l as NSString).draw(at: CGPoint(x: 60, y: 70 + CGFloat(i) * 115), withAttributes: [.font: font, .foregroundColor: UIColor(red: 0.1, green: 0.12, blue: 0.35, alpha: 1)])
      }
    }
  }
  #endif
}

extension CGImagePropertyOrientation {
  init(_ o: UIImage.Orientation) {
    switch o {
    case .up: self = .up
    case .down: self = .down
    case .left: self = .left
    case .right: self = .right
    case .upMirrored: self = .upMirrored
    case .downMirrored: self = .downMirrored
    case .leftMirrored: self = .leftMirrored
    case .rightMirrored: self = .rightMirrored
    @unknown default: self = .up
    }
  }
}

/// The camera, for one photo. The image is handed back in memory and never saved.
struct CameraPicker: UIViewControllerRepresentable {
  let done: (UIImage?) -> Void

  func makeUIViewController(context: Context) -> UIImagePickerController {
    let c = UIImagePickerController()
    c.sourceType = .camera
    c.delegate = context.coordinator
    return c
  }

  func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

  func makeCoordinator() -> Coordinator { Coordinator(done: done) }

  final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    let done: (UIImage?) -> Void
    init(done: @escaping (UIImage?) -> Void) { self.done = done }
    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
      done(info[.originalImage] as? UIImage)
    }
    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { done(nil) }
  }
}
