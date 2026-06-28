import AppKit
import Combine
import SwiftUI

@MainActor
final class StatusBarController: NSObject, NSMenuDelegate {
  static let shared = StatusBarController()

  private var statusItem: NSStatusItem?
  private let menu = NSMenu(title: "PocketBridge")
  private weak var model: BridgeDashboardModel?
  private var openDashboard: (() -> Void)?
  private var cancellable: AnyCancellable?

  func install(model: BridgeDashboardModel, openDashboard: @escaping () -> Void) {
    self.model = model
    self.openDashboard = openDashboard

    if statusItem == nil {
      let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
      item.button?.title = "PB"
      item.button?.toolTip = "PocketBridge"
      item.button?.font = .systemFont(ofSize: 13, weight: .semibold)
      statusItem = item
    }

    updateButtonTitle()
    rebuildMenu()
    menu.delegate = self
    statusItem?.menu = menu

    cancellable = model.objectWillChange.sink { [weak self] _ in
      Task { @MainActor in
        self?.updateButtonTitle()
      }
    }
  }

  func showExistingDashboardWindow() {
    NSApplication.shared.activate(ignoringOtherApps: true)
    if let window = NSApplication.shared.windows.first(where: { $0.title.contains("PocketBridge") || $0.isVisible }) {
      window.makeKeyAndOrderFront(nil)
      return
    }
  }

  func menuNeedsUpdate(_ menu: NSMenu) {
    rebuildMenu()
  }

  private func updateButtonTitle() {
    guard let button = statusItem?.button else {
      return
    }

    switch model?.agentStatus?.pocketKey.state {
    case "trusted":
      button.title = "PB OK"
    case "locked":
      button.title = "PB LOCK"
    case "away":
      button.title = "PB !"
    default:
      button.title = "PB"
    }
  }

  private func rebuildMenu() {
    menu.removeAllItems()
    menu.addItem(menuItem("Open PocketBridge", action: #selector(openPocketBridge), key: ""))
    menu.addItem(.separator())
    menu.addItem(disabledItem("PocketKey: \(model?.agentStatus?.pocketKey.state.capitalized ?? "Unknown")"))
    menu.addItem(disabledItem(rssiText))
    menu.addItem(disabledItem("Agent: \(model?.agentState.rawValue ?? "Offline")"))
    menu.addItem(disabledItem("Bridge: \(model?.serverState.rawValue ?? "Offline")"))
    menu.addItem(.separator())
    menu.addItem(menuItem(model?.isStarting == true ? "Starting..." : "Start Demo Stack", action: #selector(startDemoStack), key: ""))
    menu.addItem(menuItem("Refresh Status", action: #selector(refreshStatus), key: ""))
    menu.addItem(menuItem("Copy Pairing Payload", action: #selector(copyPairingPayload), key: ""))
    menu.addItem(.separator())

    let autoLock = menuItem("Auto Demo Lock", action: #selector(toggleAutoDemoLock), key: "")
    autoLock.state = model?.demoLockEnabled == true ? .on : .off
    menu.addItem(autoLock)

    if model?.demoShieldActive == true {
      menu.addItem(menuItem("Unlock Demo Shield", action: #selector(unlockDemoShield), key: ""))
    } else {
      menu.addItem(menuItem("Show Demo Lock", action: #selector(showDemoLock), key: ""))
    }

    menu.addItem(.separator())
    menu.addItem(menuItem("Stop Owned Stack", action: #selector(stopOwnedStack), key: ""))
    menu.addItem(menuItem("Quit PocketBridge", action: #selector(quitPocketBridge), key: "q"))
  }

  private var rssiText: String {
    guard let rssi = model?.agentStatus?.pocketKey.lastRssi else {
      return "RSSI: --"
    }
    return "RSSI: \(rssi) dBm"
  }

  private func menuItem(_ title: String, action: Selector, key: String) -> NSMenuItem {
    let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
    item.target = self
    return item
  }

  private func disabledItem(_ title: String) -> NSMenuItem {
    let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
    item.isEnabled = false
    return item
  }

  @objc private func openPocketBridge() {
    openDashboard?()
  }

  @objc private func startDemoStack() {
    Task {
      await model?.startDemoStack()
      openDashboard?()
    }
  }

  @objc private func refreshStatus() {
    Task {
      await model?.refresh()
    }
  }

  @objc private func copyPairingPayload() {
    model?.copyPairingPayload()
  }

  @objc private func toggleAutoDemoLock() {
    guard let model else {
      return
    }
    model.setDemoLockEnabled(!model.demoLockEnabled)
  }

  @objc private func showDemoLock() {
    model?.showDemoLockNow()
  }

  @objc private func unlockDemoShield() {
    model?.dismissDemoLockManually()
  }

  @objc private func stopOwnedStack() {
    model?.stopOwnedStack()
  }

  @objc private func quitPocketBridge() {
    model?.stopOwnedStack()
    AppDelegate.allowTermination = true
    NSApplication.shared.terminate(nil)
  }
}

struct StatusBarInstaller: ViewModifier {
  @ObservedObject var model: BridgeDashboardModel
  let openDashboard: () -> Void

  func body(content: Content) -> some View {
    content.onAppear {
      StatusBarController.shared.install(model: model, openDashboard: openDashboard)
    }
  }
}

extension View {
  func installsPocketBridgeStatusItem(
    model: BridgeDashboardModel,
    openDashboard: @escaping () -> Void
  ) -> some View {
    modifier(StatusBarInstaller(model: model, openDashboard: openDashboard))
  }
}
