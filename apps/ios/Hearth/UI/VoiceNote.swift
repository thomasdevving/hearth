import AVFoundation
import Observation
import SwiftUI

/// A short voice note about what helped (at most `Helped.maxSeconds`), recorded to a temporary
/// file, read into memory and the file removed. It is stored with the note on this device only.
@MainActor @Observable
final class VoiceRecorder {
  /// Seconds left while recording; nil otherwise.
  private(set) var secondsLeft: Int?
  private(set) var data: Data?
  private(set) var failed = false

  private var recorder: AVAudioRecorder?
  private var timer: Timer?
  private let url = FileManager.default.temporaryDirectory.appendingPathComponent("hearth-voice-note.m4a")

  var recording: Bool { secondsLeft != nil }

  func start() async {
    failed = false
    guard await AVAudioApplication.requestRecordPermission() else { failed = true; return }
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
      try session.setActive(true)
      let settings: [String: Any] = [
        AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 22_050, AVNumberOfChannelsKey: 1,
        AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
      ]
      let r = try AVAudioRecorder(url: url, settings: settings)
      guard r.record(forDuration: TimeInterval(Helped.maxSeconds)) else { failed = true; return }
      recorder = r
      secondsLeft = Helped.maxSeconds
      timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
        Task { @MainActor in self?.tick() }
      }
    } catch {
      failed = true
    }
  }

  func stop() {
    recorder?.stop()
    finish()
  }

  private func tick() {
    guard let r = recorder else { return }
    if !r.isRecording { finish(); return }
    secondsLeft = max(1, Helped.maxSeconds - Int(r.currentTime))
  }

  private func finish() {
    guard recorder != nil else { return }
    timer?.invalidate(); timer = nil
    recorder = nil
    data = try? Data(contentsOf: url)
    try? FileManager.default.removeItem(at: url)
    secondsLeft = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}

/// Plays a saved voice note.
@MainActor @Observable
final class VoicePlayer: NSObject, AVAudioPlayerDelegate {
  private(set) var playing = false
  @ObservationIgnored private var player: AVAudioPlayer?

  func toggle(_ data: Data) {
    if playing { player?.stop(); playing = false; return }
    do {
      try AVAudioSession.sharedInstance().setCategory(.playback)
      try AVAudioSession.sharedInstance().setActive(true)
      let p = try AVAudioPlayer(data: data)
      p.delegate = self
      player = p
      playing = p.play()
    } catch {
      playing = false
    }
  }

  nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    Task { @MainActor in self.playing = false }
  }
}

/// "Your voice note": play or stop.
struct VoiceNoteButton: View {
  let data: Data
  @State private var player = VoicePlayer()
  var body: some View {
    Button { player.toggle(data) } label: {
      Label(player.playing ? "Stop" : "Play your voice note", systemImage: player.playing ? "stop.fill" : "play.fill")
    }
    .buttonStyle(.compact)
    .accessibilityLabel(player.playing ? "Stop your voice note" : "Play your voice note")
  }
}
