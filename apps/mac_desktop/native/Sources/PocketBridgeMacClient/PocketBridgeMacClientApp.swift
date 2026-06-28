import SwiftUI

@main
struct PocketBridgeMacClientApp: App {
  var body: some Scene {
    WindowGroup {
      DashboardView()
    }
    .windowStyle(.titleBar)
    .commands {
      CommandGroup(replacing: .newItem) {}
    }
  }
}
