import AppKit
import SwiftUI

@main
struct PocketBridgeMacClientApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var model = BridgeDashboardModel()

  var body: some Scene {
    WindowGroup("PocketBridge", id: "dashboard") {
      DashboardView(model: model)
    }
    .windowStyle(.titleBar)
    .commands {
      CommandGroup(replacing: .newItem) {}
    }

    MenuBarExtra {
      MenuBarStatusView(model: model)
    } label: {
      Label("PocketBridge", systemImage: menuBarIcon)
    }
    .menuBarExtraStyle(.menu)
  }

  private var menuBarIcon: String {
    if model.demoShieldActive {
      return "lock.fill"
    }
    switch model.agentStatus?.pocketKey.state {
    case "trusted":
      return "lock.open.fill"
    case "locked":
      return "lock.fill"
    case "away":
      return "lock.trianglebadge.exclamationmark"
    default:
      return "bridge.2"
    }
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    false
  }
}
