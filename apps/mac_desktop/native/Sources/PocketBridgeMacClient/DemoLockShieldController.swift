import AppKit
import SwiftUI

@MainActor
final class DemoLockShieldController {
  private var windows: [NSWindow] = []
  private var showing = false

  var isVisible: Bool {
    showing
  }

  func show(status: AgentStatus?, onUnlock: @escaping () -> Void) {
    guard !showing else {
      return
    }

    let screens = NSScreen.screens.isEmpty ? [NSScreen.main].compactMap { $0 } : NSScreen.screens
    if windows.count != screens.count {
      windows = screens.map(makeWindow)
    }

    for (window, screen) in zip(windows, screens) {
      window.setFrame(screen.frame, display: false)
      window.contentView = NSHostingView(rootView: DemoLockShieldView(status: status, onUnlock: onUnlock))
      window.makeKeyAndOrderFront(nil)
    }

    showing = true
    NSApplication.shared.activate(ignoringOtherApps: true)
  }

  func hide() {
    guard showing else {
      return
    }

    showing = false
    for window in windows {
      window.orderOut(nil)
    }
  }

  private func makeWindow(for screen: NSScreen) -> NSWindow {
    let window = NSWindow(
      contentRect: screen.frame,
      styleMask: [.borderless],
      backing: .buffered,
      defer: false,
      screen: screen
    )
    window.backgroundColor = .black
    window.isOpaque = true
    window.level = .screenSaver
    window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    window.ignoresMouseEvents = false
    window.isReleasedWhenClosed = false
    return window
  }
}

struct DemoLockShieldView: View {
  let status: AgentStatus?
  let onUnlock: () -> Void

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [Color.black, Color(red: 0.03, green: 0.05, blue: 0.07), Color.black],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      .ignoresSafeArea()

      VStack(spacing: 26) {
        Image(systemName: "lock.shield.fill")
          .font(.system(size: 82, weight: .semibold))
          .foregroundStyle(.white)

        VStack(spacing: 10) {
          Text("PocketBridge Locked")
            .font(.system(size: 48, weight: .semibold))
            .foregroundStyle(.white)
          Text("Trusted phone is away")
            .font(.system(size: 20, weight: .medium))
            .foregroundStyle(.white.opacity(0.68))
        }

        HStack(spacing: 18) {
          ShieldMetric(title: "PocketKey", value: status?.pocketKey.state.capitalized ?? "Locked")
          ShieldMetric(title: "RSSI", value: status?.pocketKey.lastRssi.map { "\($0) dBm" } ?? "--")
          ShieldMetric(title: "Unlock", value: "Trusted")
        }

        Text("Move the paired phone back near this Mac to restore the client.")
          .font(.system(size: 15, weight: .medium))
          .foregroundStyle(.white.opacity(0.56))

        Button {
          onUnlock()
        } label: {
          Label("Demo Unlock", systemImage: "lock.open")
            .padding(.horizontal, 18)
            .padding(.vertical, 8)
        }
        .buttonStyle(.borderedProminent)
        .tint(.white)
        .foregroundStyle(.black)
      }
      .padding(40)
    }
  }
}

struct ShieldMetric: View {
  let title: String
  let value: String

  var body: some View {
    VStack(spacing: 8) {
      Text(title)
        .font(.caption)
        .foregroundStyle(.white.opacity(0.54))
      Text(value)
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(.white)
        .lineLimit(1)
    }
    .frame(width: 150, height: 76)
    .background(.white.opacity(0.09))
    .clipShape(RoundedRectangle(cornerRadius: 8))
    .overlay(RoundedRectangle(cornerRadius: 8).stroke(.white.opacity(0.12)))
  }
}
