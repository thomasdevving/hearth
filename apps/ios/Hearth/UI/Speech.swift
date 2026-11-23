import AVFoundation
import Observation
import Speech
import SwiftUI

/// On-device speech input (mirror of apps/web/src/ui/Speech.tsx; docs/05 §3, P1). Audio is
/// class S3: only on-device recognition is used (`requiresOnDeviceRecognition`). Where the
/// device cannot recognise speech locally there is no microphone button; Apple's server-based
/// recognition is never used. Nothing is recorded to a file.
@MainActor @Observable
final class SpeechInput {
  private(set) var listening = false
  private(set) var note: String?

  @ObservationIgnored private var engine: AVAudioEngine?
  @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
  @ObservationIgnored private var task: SFSpeechRecognitionTask?

  static let locale = Locale(identifier: "en-US")

  /// Whether this device can recognise English speech without a server.
  static var onDeviceSupported: Bool { SFSpeechRecognizer(locale: locale)?.supportsOnDeviceRecognition == true }

  static let unsupported = "Speech input needs on-device recognition, which this iPhone does not have. Please type instead."
  static let notAllowed = "Hearth may not use the microphone or speech recognition. You can allow it in the Settings app, or type instead."

  func start(onText: @escaping (String) -> Void) async {
    note = nil
    guard let recognizer = SFSpeechRecognizer(locale: Self.locale), recognizer.supportsOnDeviceRecognition else {
      note = Self.unsupported
      return
    }
    let auth = await withCheckedContinuation { (c: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
      SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) }
    }
    guard auth == .authorized, await AVAudioApplication.requestRecordPermission() else {
      note = Self.notAllowed
      return
    }
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.record, mode: .measurement, options: .duckOthers)
      try session.setActive(true, options: .notifyOthersOnDeactivation)
      let req = SFSpeechAudioBufferRecognitionRequest()
      req.requiresOnDeviceRecognition = true   // never Apple's servers (R3)
      req.shouldReportPartialResults = false
      req.addsPunctuation = true
      let engine = AVAudioEngine()
      let input = engine.inputNode
      input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0), block: Self.tap(req))
      engine.prepare()
      try engine.start()
      self.engine = engine
      self.request = req
      listening = true
      task = recognizer.recognitionTask(with: req, resultHandler: Self.handler { [weak self] text, done in
        if let text, !text.isEmpty { onText(text) }
        if done { self?.finish() }
      })
    } catch {
      finish()
      note = Self.unsupported
    }
  }

  // The audio tap and the result handler run on background threads: they are built outside the
  // main actor and hop back to it.
  nonisolated private static func tap(_ req: SFSpeechAudioBufferRecognitionRequest) -> AVAudioNodeTapBlock {
    { buffer, _ in req.append(buffer) }
  }

  nonisolated private static func handler(_ deliver: @escaping @MainActor (String?, Bool) -> Void) -> (SFSpeechRecognitionResult?, Error?) -> Void {
    { result, error in
      let final = result?.isFinal == true
      let text = final ? result?.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines) : nil
      let done = final || error != nil
      Task { @MainActor in deliver(text, done) }
    }
  }

  /// Stops listening; the final text arrives through `onText` shortly after.
  func stop() {
    engine?.stop()
    engine?.inputNode.removeTap(onBus: 0)
    request?.endAudio()
    listening = false
  }

  private func finish() {
    if engine?.isRunning == true { engine?.stop(); engine?.inputNode.removeTap(onBus: 0) }
    engine = nil
    request = nil
    task = nil
    listening = false
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}

/// A microphone button that hands what was said to a text field (web: `MicButton`). Hidden
/// when the device has no on-device recognition.
struct MicButton: View {
  var label = "Speak"
  let onText: (String) -> Void
  @State private var speech = SpeechInput()

  var body: some View {
    if SpeechInput.onDeviceSupported || speech.note != nil {
      VStack(alignment: .leading, spacing: 4) {
        if SpeechInput.onDeviceSupported {
          Button {
            if speech.listening { speech.stop() } else { Task { await speech.start(onText: onText) } }
          } label: {
            Label(speech.listening ? "Stop" : label, systemImage: speech.listening ? "stop.fill" : "mic")
          }
          .buttonStyle(.compact)
          .accessibilityValue(speech.listening ? "listening" : "")
        }
        if let n = speech.note { Text(n).font(HearthFont.body(14)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true) }
      }
    }
  }
}
