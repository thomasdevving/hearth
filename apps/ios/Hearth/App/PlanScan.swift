import CoreGraphics
import Foundation
import ImageIO
import Vision

// "Scan a paper plan" (task G2, docs/05; web: PlanSetup.tsx `ScanPlan`) and the spoken check-in
// (task I, web: Checkin.tsx). Both are class S3 and stay on this device.
//
// G2 on iOS (docs/05 G2, PLATFORM_NOTES): Vision reads the text from the photo on the device,
// then task G2 runs through the router on that text to put it in reading order. Every line the
// model returns must be found in what Vision read (quote check, R8); otherwise Vision's own text
// is used. Without a model, Vision's text is used as it is. The photo is never stored. The text
// goes into the plan field for the user to correct; task G then makes the cards from it.

enum PlanScan {
  /// Text lines in the photo, read on this device (Vision text recognition).
  static func recognize(_ image: CGImage, orientation: CGImagePropertyOrientation = .up) async throws -> [String] {
    try await Task.detached(priority: .userInitiated) {
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      request.recognitionLanguages = ["en-US"]
      try VNImageRequestHandler(cgImage: image, orientation: orientation).perform([request])
      return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }.value
  }

  /// The model's transcription when every line of it is in the recognised text, else nil.
  static func verified(model: String, ocr: String) -> String? {
    let lines = model.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    guard !lines.isEmpty else { return nil }
    let source = Helped.normalize(ocr)
    for line in lines {
      let n = Helped.normalize(line)
      if n.isEmpty { continue }   // punctuation only
      if n.count < 3 {
        guard " \(source) ".contains(" \(n) ") else { return nil }
        continue
      }
      let ok = (try? Engine.shared.call("verifyQuote", line, ocr)) == "true"
      if !ok { return nil }
    }
    return lines.joined(separator: "\n")
  }
}

extension AppModel {
  /// G2 on the recognised lines. Returns the text for the plan field and where it was made
  /// (`on_device` when the model's transcription passed the check, else `template`).
  func transcribePlan(lines: [String]) async -> (text: String, ranOn: String)? {
    let ocr = lines.joined(separator: "\n")
    guard !ocr.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    let input: [String: Any] = [
      "instruction": "The text below was read from a photo of a paper plan on this device. Transcribe it exactly, line by line, in reading order.",
      "text": ocr,
    ]
    let res = await router.run("G2", input: input, options: .init(sourceText: ocr))
    if res.ok, let t = (JSONText.object(res.json ?? "") as? [String: Any])?["text"] as? String, let v = PlanScan.verified(model: t, ocr: ocr) {
      return (v, res.ranOn)
    }
    return (ocr, "template")
  }

  /// Task I: the user's own check-in questions answered from what they said. Only questions
  /// that were sent and answers with a quote that is in the text survive (R8); the three
  /// momentary items are always tapped (R1). nil: no model, the user taps their answers.
  func answersFromSpeech(_ text: String, items: [PersonalItemValue]) async -> [String: String]? {
    let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !t.isEmpty, !items.isEmpty else { return nil }
    let ids = items.map(\.id)
    let input: [String: Any] = ["text": t, "items": items.map { ["item_id": $0.id, "question": $0.question] }]
    let res = await router.run("I", input: input, options: .init(sourceText: t, verify: ["sourceText": t, "itemIds": ids]))
    guard res.ok else { return nil }
    return Self.spokenAnswers(res.json, ids: ids)
  }

  /// The second check on task I's verified output: known ids and real answers only.
  static func spokenAnswers(_ json: String?, ids: [String]) -> [String: String] {
    struct Out: Decodable { struct A: Decodable { let item_id: String; let answer: String }; let answers: [A] }
    guard let json, let out = try? JSONText.decode(Out.self, json) else { return [:] }
    var result: [String: String] = [:]
    for a in out.answers where ids.contains(a.item_id) && ["yes", "partly", "no"].contains(a.answer) { result[a.item_id] = a.answer }
    return result
  }

  /// Whether a model may answer task I (web: `modelMayRun`).
  var spokenModelMayRun: Bool {
    #if DEBUG
    if DemoData.spoken { return true }
    #endif
    return settings.onDeviceEnabled && OnDeviceModel.isAvailable
  }
}
