import CoreGraphics
import Foundation
import ScreenCaptureKit

struct ScreenAccessResponse: Encodable {
    let granted: Bool
    let status: String
}

func emit(_ response: ScreenAccessResponse) {
    let encoder = JSONEncoder()
    if let data = try? encoder.encode(response),
       let text = String(data: data, encoding: .utf8) {
        print(text)
    } else {
        print("{\"granted\":false,\"status\":\"unknown\"}")
    }
}

let command = CommandLine.arguments.dropFirst().first ?? "status"
let currentGranted = CGPreflightScreenCaptureAccess()

switch command {
case "request":
    if currentGranted {
        emit(ScreenAccessResponse(granted: true, status: "granted"))
    } else {
        let requested = CGRequestScreenCaptureAccess()
        emit(ScreenAccessResponse(granted: requested, status: requested ? "granted" : "denied"))
    }
default:
    emit(ScreenAccessResponse(granted: currentGranted, status: currentGranted ? "granted" : "denied"))
}
