#!/usr/bin/env swift
import AppKit
import CoreText
import Foundation

guard CommandLine.arguments.count == 5 else {
  fputs("Usage: render-carousel.swift <svg-directory> <png-directory> <width> <height>\n", stderr)
  exit(64)
}
let input = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let output = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
guard let width = Int(CommandLine.arguments[3]), let height = Int(CommandLine.arguments[4]) else { exit(64) }
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

// Register the bundled brand fonts before AppKit parses SVG text. Without this,
// NSImage silently falls back to a system sans-serif font for editable exports.
let bundledFonts = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
  .appendingPathComponent("dist/fonts", isDirectory: true)
let fontFiles = ["Yuyu-Regular.ttf", "RadioCanadaBig-Variable.ttf", "SpaceGrotesk-Variable.ttf"]
for name in fontFiles {
  let fontURL = bundledFonts.appendingPathComponent(name)
  if FileManager.default.fileExists(atPath: fontURL.path) {
    var registrationError: Unmanaged<CFError>?
    _ = CTFontManagerRegisterFontsForURL(fontURL as CFURL, .process, &registrationError)
  }
}

let files = try FileManager.default.contentsOfDirectory(at: input, includingPropertiesForKeys: nil)
  .filter { $0.pathExtension.lowercased() == "svg" }.sorted { $0.lastPathComponent < $1.lastPathComponent }

for file in files {
  guard let image = NSImage(contentsOf: file),
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
          bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
          colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else {
    throw NSError(domain: "CarouselRenderer", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not read \(file.lastPathComponent)"])
  }
  bitmap.size = NSSize(width: width, height: height)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
  image.draw(in: NSRect(x: 0, y: 0, width: width, height: height), from: .zero, operation: .copy, fraction: 1)
  NSGraphicsContext.restoreGraphicsState()
  guard let png = bitmap.representation(using: .png, properties: [:]) else { continue }
  try png.write(to: output.appendingPathComponent(file.deletingPathExtension().lastPathComponent + ".png"))
}
print("Rendered \(files.count) slide(s) at \(width)x\(height) into \(output.path)")
