import AppKit
import SwiftUI

struct MenuBarStatusView: View {
  @ObservedObject var model: BridgeDashboardModel
  @Environment(\.openWindow) private var openWindow

  var body: some View {
    Button {
      showDashboard()
    } label: {
      Label("Open PocketBridge", systemImage: "rectangle.on.rectangle")
    }

    Divider()

    Text("PocketKey: \(pocketKeyState)")
    Text(rssiText)
    Text("Agent: \(model.agentState.rawValue)")
    Text("Bridge: \(model.serverState.rawValue)")

    Divider()

    Button {
      Task {
        await model.startDemoStack()
        showDashboard()
      }
    } label: {
      Label(model.isStarting ? "Starting..." : "Start Demo Stack", systemImage: "play.fill")
    }
    .disabled(model.isStarting)

    Button {
      Task { await model.refresh() }
    } label: {
      Label("Refresh Status", systemImage: "arrow.clockwise")
    }

    Button {
      model.copyPairingPayload()
    } label: {
      Label("Copy Pairing Payload", systemImage: "doc.on.doc")
    }
    .disabled(model.pairCode == nil)

    Divider()

    Toggle(
      "Auto Demo Lock",
      isOn: Binding(
        get: { model.demoLockEnabled },
        set: { model.setDemoLockEnabled($0) }
      )
    )

    if model.demoShieldActive {
      Button {
        model.dismissDemoLockManually()
      } label: {
        Label("Unlock Demo Shield", systemImage: "lock.open")
      }
    } else {
      Button {
        model.showDemoLockNow()
      } label: {
        Label("Show Demo Lock", systemImage: "lock.fill")
      }
    }

    Divider()

    Button {
      model.stopOwnedStack()
    } label: {
      Label("Stop Owned Stack", systemImage: "stop.fill")
    }

    Button {
      model.stopOwnedStack()
      NSApplication.shared.terminate(nil)
    } label: {
      Label("Quit PocketBridge", systemImage: "power")
    }
  }

  private var pocketKeyState: String {
    model.agentStatus?.pocketKey.state.capitalized ?? "Unknown"
  }

  private var rssiText: String {
    guard let rssi = model.agentStatus?.pocketKey.lastRssi else {
      return "RSSI: --"
    }
    return "RSSI: \(rssi) dBm"
  }

  private func showDashboard() {
    openWindow(id: "dashboard")
    NSApplication.shared.activate(ignoringOtherApps: true)
  }
}
