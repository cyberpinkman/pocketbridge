import AppKit
import SwiftUI

@main
struct PocketBridgeMacClientApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var model: BridgeDashboardModel

  init() {
    let model = BridgeDashboardModel()
    _model = StateObject(wrappedValue: model)
    AppDelegate.model = model
  }

  var body: some Scene {
    WindowGroup("PocketBridge", id: "dashboard") {
      DashboardView(model: model)
    }
    .windowStyle(.titleBar)
    .commands {
      CommandGroup(replacing: .newItem) {}
    }
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  static var model: BridgeDashboardModel?
  static var allowTermination = false
  private var keepAliveWindow: NSWindow?

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApplication.shared.setActivationPolicy(.regular)
    installKeepAliveWindow()
    if let model = Self.model {
      StatusBarController.shared.install(model: model) {
        StatusBarController.shared.showExistingDashboardWindow()
      }
    }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    false
  }

  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    guard Self.allowTermination else {
      StatusBarController.shared.showExistingDashboardWindow()
      return .terminateCancel
    }
    return .terminateNow
  }

  private func installKeepAliveWindow() {
    let window = NSWindow(
      contentRect: NSRect(x: -10_000, y: -10_000, width: 1, height: 1),
      styleMask: [.borderless],
      backing: .buffered,
      defer: false
    )
    window.alphaValue = 0
    window.ignoresMouseEvents = true
    window.collectionBehavior = [.canJoinAllSpaces, .stationary]
    window.isReleasedWhenClosed = false
    window.orderFront(nil)
    keepAliveWindow = window
  }
}
