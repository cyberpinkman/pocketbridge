import AppKit
import Foundation

@MainActor
final class BridgeDashboardModel: ObservableObject {
  @Published var serverState: ServiceRunState = .offline
  @Published var agentState: ServiceRunState = .offline
  @Published var isStarting = false
  @Published var isRefreshing = false
  @Published var health: HealthResponse?
  @Published var pairing: PairingPayload?
  @Published var qrCode: PairingQRCode?
  @Published var bleStatus: BleStatus?
  @Published var agentStatus: AgentStatus?
  @Published var items: [BridgeItem] = []
  @Published var selectedItemId: BridgeItem.ID?
  @Published var quickText = ""
  @Published var lastError: String?
  @Published var logs: [ClientLogEntry] = []

  let repoRoot: URL
  private let api = BridgeAPI()
  private var serverProcess: Process?
  private var agentProcess: Process?
  private var refreshTask: Task<Void, Never>?

  init(repoRoot: URL = RepoLocator.findRepoRoot()) {
    self.repoRoot = repoRoot
  }

  var selectedItem: BridgeItem? {
    items.first { $0.id == selectedItemId } ?? items.first
  }

  var pairCode: String? {
    pairing?.pairCode
  }

  func bootstrap() async {
    appendLog("Client", "Using repo root \(repoRoot.path)")
    await refresh()
    startPolling()
  }

  func startPolling() {
    refreshTask?.cancel()
    refreshTask = Task { [weak self] in
      while !Task.isCancelled {
        await self?.refresh()
        try? await Task.sleep(nanoseconds: 3_000_000_000)
      }
    }
  }

  func startDemoStack() async {
    guard !isStarting else {
      return
    }

    isStarting = true
    lastError = nil
    defer { isStarting = false }

    do {
      try await startAgentIfNeeded()
      try await startServerIfNeeded()
      try await Task.sleep(nanoseconds: 1_000_000_000)
      await ensurePairing()
      await refresh()
    } catch {
      lastError = error.localizedDescription
      appendLog("Client", "Start failed: \(error.localizedDescription)")
    }
  }

  func stopOwnedStack() {
    if let serverProcess {
      serverProcess.terminate()
      appendLog("Server", "Terminated client-owned server")
    }
    if let agentProcess {
      agentProcess.terminate()
      appendLog("BLE Agent", "Terminated client-owned BLE agent")
    }
    serverProcess = nil
    agentProcess = nil
    serverState = .offline
    agentState = .offline
  }

  func refresh() async {
    guard !isRefreshing else {
      return
    }
    isRefreshing = true
    defer { isRefreshing = false }

    do {
      health = try await api.fetchHealth()
      if serverProcess != nil {
        serverState = .owned
      } else if serverState != .owned {
        serverState = .external
      }
      await ensurePairing()
    } catch {
      health = nil
      if serverProcess == nil {
        serverState = .offline
      }
    }

    do {
      agentStatus = try await api.fetchAgentStatus()
      if agentProcess != nil {
        agentState = .owned
      } else if agentState != .owned {
        agentState = .external
      }
    } catch {
      agentStatus = nil
      if agentProcess == nil {
        agentState = .offline
      }
    }

    guard let pairCode else {
      return
    }

    do {
      async let nextItems = api.fetchItems(pairCode: pairCode)
      async let nextBleStatus = api.fetchBleStatus(pairCode: pairCode)
      items = try await nextItems
      bleStatus = try await nextBleStatus
      if selectedItemId == nil || !items.contains(where: { $0.id == selectedItemId }) {
        selectedItemId = items.first?.id
      }
    } catch {
      lastError = error.localizedDescription
    }
  }

  func createNewPairing() async {
    do {
      pairing = try await api.createPairing()
      if let pairCode = pairing?.pairCode {
        qrCode = try await api.fetchPairingQR(pairCode: pairCode)
        appendLog("Pairing", "Created pair code \(pairCode)")
      }
      await refresh()
    } catch {
      lastError = error.localizedDescription
      appendLog("Pairing", "Failed: \(error.localizedDescription)")
    }
  }

  func addQuickText() async {
    let text = quickText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty, let pairCode else {
      return
    }

    do {
      let item = try await api.addText(text, pairCode: pairCode)
      quickText = ""
      appendLog("Inbox", "Captured text item \(item.title)")
      await refresh()
    } catch {
      lastError = error.localizedDescription
    }
  }

  func uploadFile(_ url: URL) async {
    guard let pairCode else {
      return
    }
    let scoped = url.startAccessingSecurityScopedResource()
    defer {
      if scoped {
        url.stopAccessingSecurityScopedResource()
      }
    }

    do {
      let item = try await api.uploadFile(url, pairCode: pairCode)
      appendLog("Inbox", "Uploaded \(item.title)")
      await refresh()
    } catch {
      lastError = error.localizedDescription
    }
  }

  func captureScreen() async {
    guard let pairCode else {
      return
    }

    let formatter = DateFormatter()
    formatter.dateFormat = "yyyyMMdd-HHmmss"
    let fileName = "PocketBridge-Capture-\(formatter.string(from: Date())).png"
    let captureURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(fileName)

    do {
      appendLog("Capture", "Select a screen region or window")
      try await runOneShot(
        name: "Screen capture",
        executable: "/usr/sbin/screencapture",
        arguments: ["-i", captureURL.path]
      )
      guard FileManager.default.fileExists(atPath: captureURL.path) else {
        appendLog("Capture", "Cancelled")
        return
      }
      let item = try await api.uploadFile(captureURL, pairCode: pairCode)
      appendLog("Capture", "Saved \(item.title)")
      await refresh()
    } catch {
      appendLog("Capture", "Cancelled or failed: \(error.localizedDescription)")
    }
  }

  func sendSelectedToPhone() async {
    guard let selectedItem, let pairCode else {
      return
    }

    do {
      let item = try await api.sendToPhone(itemId: selectedItem.id, pairCode: pairCode)
      appendLog("BLE", "Queued \(item.title) for phone")
      await refresh()
    } catch {
      lastError = error.localizedDescription
    }
  }

  func sendSelectedByBluetooth() async {
    guard let selectedItem, let pairCode else {
      return
    }

    do {
      let response = try await api.sendByBluetooth(itemId: selectedItem.id, pairCode: pairCode)
      appendLog(
        "BLE",
        "Queued \(response.item.title) via \(response.transfer.channel), \(response.transfer.chunkSizeBytes)-byte chunks"
      )
      await refresh()
    } catch {
      lastError = error.localizedDescription
    }
  }

  func exportSelectedToKnowledge() async {
    guard let selectedItem, let pairCode else {
      return
    }

    do {
      let item = try await api.exportToKnowledge(itemId: selectedItem.id, pairCode: pairCode)
      appendLog("Knowledge", "Saved \(item.title)")
      await refresh()
    } catch {
      lastError = error.localizedDescription
    }
  }

  func importSnapzy() async {
    do {
      let imported = try await api.importSnapzy()
      appendLog("Snapzy", "Imported \(imported) file(s)")
      await refresh()
    } catch {
      lastError = error.localizedDescription
    }
  }

  func lockMacNow() async {
    do {
      try await api.lockMacNow()
      appendLog("PocketKey", "Requested macOS lock")
      await refresh()
    } catch {
      lastError = error.localizedDescription
    }
  }

  func copyPairingPayload() {
    guard let pairing else {
      return
    }
    let payload = """
    {"protocol":"pocketbridge","version":\(pairing.version),"serverBaseUrl":"\(pairing.serverBaseUrl)","wsUrl":"\(pairing.wsUrl)","pairCode":"\(pairing.pairCode)","deviceName":"\(pairing.deviceName)"}
    """
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(payload, forType: .string)
    appendLog("Pairing", "Copied pairing payload")
  }

  func revealRepoRoot() {
    NSWorkspace.shared.activateFileViewerSelecting([repoRoot])
  }

  private func ensurePairing() async {
    if pairing != nil {
      if qrCode == nil, let pairCode = pairing?.pairCode {
        qrCode = try? await api.fetchPairingQR(pairCode: pairCode)
      }
      return
    }
    do {
      pairing = try await api.createPairing()
      if let pairCode = pairing?.pairCode {
        qrCode = try await api.fetchPairingQR(pairCode: pairCode)
      }
    } catch {
      return
    }
  }

  private func startServerIfNeeded() async throws {
    if (try? await api.fetchHealth()) != nil {
      serverState = .external
      appendLog("Server", "Detected existing server on 3000")
      return
    }

    serverState = .starting
    appendLog("Server", "Building TypeScript bridge")
    try await runOneShot(name: "Server build", executable: "/usr/bin/env", arguments: ["npm", "run", "build"])

    appendLog("Server", "Starting Node bridge on 3000")
    serverProcess = try launchManagedProcess(
      name: "Server",
      executable: "/usr/bin/env",
      arguments: ["node", "dist/server/src/index.js"],
      environment: serverEnvironment()
    )
    serverState = .owned
  }

  private func startAgentIfNeeded() async throws {
    if (try? await api.fetchAgentStatus()) != nil {
      agentState = .external
      appendLog("BLE Agent", "Detected existing agent on 41237")
      return
    }

    guard let agentExecutable = findAgentExecutable() else {
      throw BridgeAPIError("BLE agent binary not found. Build integrations/real-ble-agent/mac-agent first.")
    }

    agentState = .starting
    appendLog("BLE Agent", "Starting \(agentExecutable.path)")
    agentProcess = try launchManagedProcess(
      name: "BLE Agent",
      executable: agentExecutable.path,
      arguments: [],
      environment: agentEnvironment()
    )
    agentState = .owned
  }

  private func findAgentExecutable() -> URL? {
    let artifact = repoRoot.appendingPathComponent("tmp/demo-artifacts/PocketBridgeBLEAgent")
    if FileManager.default.isExecutableFile(atPath: artifact.path) {
      return artifact
    }
    let release = repoRoot.appendingPathComponent("integrations/real-ble-agent/mac-agent/.build/release/PocketBridgeBLEAgent")
    if FileManager.default.isExecutableFile(atPath: release.path) {
      return release
    }
    return nil
  }

  private func runOneShot(name: String, executable: String, arguments: [String]) async throws {
    try await withCheckedThrowingContinuation { continuation in
      let process = configuredProcess(executable: executable, arguments: arguments, environment: processEnvironment())
      process.terminationHandler = { [weak self] process in
        Task { @MainActor in
          if process.terminationStatus == 0 {
            self?.appendLog(name, "Completed")
            continuation.resume()
          } else {
            continuation.resume(throwing: BridgeAPIError("\(name) exited with \(process.terminationStatus)"))
          }
        }
      }
      do {
        try process.run()
      } catch {
        continuation.resume(throwing: error)
      }
    }
  }

  private func launchManagedProcess(
    name: String,
    executable: String,
    arguments: [String],
    environment: [String: String]
  ) throws -> Process {
    let process = configuredProcess(executable: executable, arguments: arguments, environment: environment)
    process.terminationHandler = { [weak self] process in
      Task { @MainActor in
        self?.appendLog(name, "Exited with \(process.terminationStatus)")
        if name == "Server" {
          self?.serverProcess = nil
          self?.serverState = .offline
        }
        if name == "BLE Agent" {
          self?.agentProcess = nil
          self?.agentState = .offline
        }
      }
    }
    try process.run()
    return process
  }

  private func configuredProcess(
    executable: String,
    arguments: [String],
    environment: [String: String]
  ) -> Process {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = arguments
    process.currentDirectoryURL = repoRoot
    process.environment = environment

    let output = Pipe()
    output.fileHandleForReading.readabilityHandler = { [weak self] handle in
      let data = handle.availableData
      guard !data.isEmpty else {
        return
      }
      let text = String(decoding: data, as: UTF8.self)
      Task { @MainActor in
        for line in text.split(whereSeparator: \.isNewline) {
          self?.appendLog(arguments.first ?? "Process", String(line))
        }
      }
    }
    process.standardOutput = output
    process.standardError = output
    return process
  }

  private func serverEnvironment() -> [String: String] {
    var env = processEnvironment()
    env["PB_BLE_TRANSPORT"] = "agent"
    env["PB_BLE_AGENT_URL"] = "http://127.0.0.1:41237"
    env["PB_POCKETKEY_TRUSTED_RSSI"] = "-62"
    env["PB_POCKETKEY_LOCKED_RSSI"] = "-78"
    env["PB_POCKETKEY_AWAY_SECONDS"] = "3"
    env["PB_POCKETKEY_LOCK_SECONDS"] = "8"
    env["PB_BLE_AWAY_MS"] = "3000"
    env["PB_BLE_LOCK_MS"] = "8000"
    return env
  }

  private func agentEnvironment() -> [String: String] {
    var env = processEnvironment()
    env["PB_POCKETKEY_TRUSTED_RSSI"] = "-62"
    env["PB_POCKETKEY_LOCKED_RSSI"] = "-78"
    env["PB_POCKETKEY_AWAY_SECONDS"] = "3"
    env["PB_POCKETKEY_LOCK_SECONDS"] = "8"
    return env
  }

  private func processEnvironment() -> [String: String] {
    var env = ProcessInfo.processInfo.environment
    let demoPath = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    env["PATH"] = "\(demoPath):\(env["PATH"] ?? "")"
    return env
  }

  private func appendLog(_ source: String, _ message: String) {
    logs.append(ClientLogEntry(source: source, message: message))
    if logs.count > 140 {
      logs.removeFirst(logs.count - 140)
    }
  }
}

enum RepoLocator {
  static func findRepoRoot() -> URL {
    if let override = ProcessInfo.processInfo.environment["PB_REPO_ROOT"], !override.isEmpty {
      return URL(fileURLWithPath: override)
    }

    var current = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    for _ in 0..<8 {
      if isRepoRoot(current) {
        return current
      }
      current.deleteLastPathComponent()
    }

    return URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
  }

  private static func isRepoRoot(_ url: URL) -> Bool {
    let package = url.appendingPathComponent("package.json")
    let server = url.appendingPathComponent("server/src/index.ts")
    return FileManager.default.fileExists(atPath: package.path)
      && FileManager.default.fileExists(atPath: server.path)
  }
}
