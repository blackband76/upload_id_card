import Foundation
import Vision
import AppKit
import PDFKit

let dirPath = "/Users/pakadon.k/Desktop/Work/Outing/2026/ID_Card_Collection"
let fm = FileManager.default
let shouldApply = CommandLine.arguments.contains("--apply")

func cgImage(fromImageAt url: URL) -> CGImage? {
    guard let nsImage = NSImage(contentsOf: url) else { return nil }
    var rect = CGRect(origin: .zero, size: nsImage.size)
    return nsImage.cgImage(forProposedRect: &rect, context: nil, hints: nil)
}

func cgImage(fromPDFAt url: URL) -> CGImage? {
    guard let doc = PDFDocument(url: url), let page = doc.page(at: 0) else { return nil }
    let bounds = page.bounds(for: .mediaBox)
    let targetWidth: CGFloat = 2400
    let scale = targetWidth / max(bounds.width, 1)
    let targetSize = CGSize(width: bounds.width * scale, height: bounds.height * scale)

    let image = NSImage(size: targetSize)
    image.lockFocus()
    guard let ctx = NSGraphicsContext.current?.cgContext else {
        image.unlockFocus()
        return nil
    }
    ctx.setFillColor(NSColor.white.cgColor)
    ctx.fill(CGRect(origin: .zero, size: targetSize))
    ctx.saveGState()
    ctx.translateBy(x: 0, y: targetSize.height)
    ctx.scaleBy(x: scale, y: -scale)
    page.draw(with: .mediaBox, to: ctx)
    ctx.restoreGState()
    image.unlockFocus()

    var rect = CGRect(origin: .zero, size: targetSize)
    return image.cgImage(forProposedRect: &rect, context: nil, hints: nil)
}

func recognizeText(from image: CGImage) -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["th-TH", "en-US"]

    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do {
        try handler.perform([request])
    } catch {
        return ""
    }

    guard let observations = request.results else { return "" }
    let lines = observations.compactMap { $0.topCandidates(1).first?.string }
    return lines.joined(separator: "\n")
}

func normalizeThaiSpaces(_ text: String) -> String {
    let collapsed = text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    return collapsed.trimmingCharacters(in: .whitespacesAndNewlines)
}

func extractThaiName(from text: String) -> (String, String, String)? {
    let normalized = normalizeThaiSpaces(text)
    let pattern = #"(นาย|นางสาว|นาง)\s*([ก-๙]{2,})\s*([ก-๙]{2,})"#
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
    let ns = normalized as NSString
    let range = NSRange(location: 0, length: ns.length)
    guard let match = regex.firstMatch(in: normalized, options: [], range: range), match.numberOfRanges == 4 else {
        return nil
    }

    let p = ns.substring(with: match.range(at: 1))
    let f = ns.substring(with: match.range(at: 2))
    let l = ns.substring(with: match.range(at: 3))
    return (p, f, l)
}

func extractTextFromPDF(_ url: URL) -> String {
    guard let doc = PDFDocument(url: url), let text = doc.string else { return "" }
    return text
}

func extractId(from filename: String) -> String? {
    let pattern = #"(\d{13})"#
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
    let ns = filename as NSString
    let range = NSRange(location: 0, length: ns.length)
    let matches = regex.matches(in: filename, options: [], range: range)
    guard let last = matches.last else { return nil }
    return ns.substring(with: last.range(at: 1))
}

func safeFileName(_ value: String) -> String {
    return value.replacingOccurrences(of: "/", with: "-")
}

guard let entries = try? fm.contentsOfDirectory(atPath: dirPath) else {
    print("Failed to read directory")
    exit(1)
}

let targets = entries.filter { $0.hasPrefix("เอกสาร_") }

var plans: [(old: String, new: String)] = []
var unresolved: [String] = []

for file in targets.sorted() {
    let url = URL(fileURLWithPath: dirPath).appendingPathComponent(file)
    let ext = url.pathExtension.lowercased()
    guard let id = extractId(from: file) else {
        unresolved.append(file)
        continue
    }

    var text = ""
    if ext == "pdf" {
        text = extractTextFromPDF(url)
    }
    if text.isEmpty {
        let cg: CGImage?
        if ["jpg", "jpeg", "png"].contains(ext) {
            cg = cgImage(fromImageAt: url)
        } else if ext == "pdf" {
            cg = cgImage(fromPDFAt: url)
        } else {
            cg = nil
        }

        guard let image = cg else {
            unresolved.append(file)
            continue
        }
        text = recognizeText(from: image)
    }
    guard let (prefix, first, last) = extractThaiName(from: text) else {
        unresolved.append(file)
        continue
    }

    let newBase = "\(prefix)_\(first)_\(last)_\(id)"
    var newName = safeFileName(newBase) + "." + ext

    var counter = 1
    while fm.fileExists(atPath: URL(fileURLWithPath: dirPath).appendingPathComponent(newName).path) {
        if newName == file { break }
        newName = safeFileName(newBase) + "_\(counter)." + ext
        counter += 1
    }

    if newName != file {
        plans.append((old: file, new: newName))
    }
}

print("Planned renames: \(plans.count)")
for p in plans {
    print("\(p.old) -> \(p.new)")
}

if shouldApply {
    for p in plans {
        let oldURL = URL(fileURLWithPath: dirPath).appendingPathComponent(p.old)
        let newURL = URL(fileURLWithPath: dirPath).appendingPathComponent(p.new)
        do {
            try fm.moveItem(at: oldURL, to: newURL)
            print("RENAMED: \(p.old) -> \(p.new)")
        } catch {
            print("FAILED: \(p.old) -> \(p.new) (\(error.localizedDescription))")
        }
    }
}

print("Unresolved: \(unresolved.count)")
for u in unresolved {
    print("UNRESOLVED: \(u)")
}
