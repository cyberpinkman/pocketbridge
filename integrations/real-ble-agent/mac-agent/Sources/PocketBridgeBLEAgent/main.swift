import CoreBluetooth
import CryptoKit
import Foundation
import Network

private let transferServiceUUID = CBUUID(string: "6f8f8e11-07bb-4f0c-b9a9-54f5af7d9c31")
private let downlinkNotifyUUID = CBUUID(string: "6f8f8e12-07bb-4f0c-b9a9-54f5af7d9c31")
private let uplinkWriteUUID = CBUUID(string: "6f8f8e13-07bb-4f0c-b9a9-54f5af7d9c31")
private let pocketKeyServiceUUID = CBUUID(string: "6f8f8e21-07bb-4f0c-b9a9-54f5af7d9c31")
private let chunkSizeBytes = 512
private let agentPort: NWEndpoint.Port = 41237

private func agentLog(_ message: String) {
  FileHandle.standardOutput.write(Data((message + "\n").utf8))
}

private func intEnv(_ name: String, fallback: Int) -> Int {
  guard let raw = ProcessInfo.processInfo.environment[name], let parsed = Int(raw) else {
    return fallback
  }
  return parsed
}

private func durationEnv(_ name: String, fallback: TimeInterval) -> TimeInterval {
  guard let raw = ProcessInfo.processInfo.environment[name], let parsed = TimeInterval(raw), parsed > 0 else {
    return fallback
  }
  return parsed
}

private func stringEnv(_ name: String, fallback: String) -> String {
  guard let raw = ProcessInfo.processInfo.environment[name]?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
    return fallback
  }
  return raw
}

private struct PocketKeyThresholds {
  let trustedRssi: Int
  let lockedRssi: Int
  let awayAfterSeconds: TimeInterval
  let lockAfterSeconds: TimeInterval

  static func liveDemo() -> PocketKeyThresholds {
    let lockedRssi = intEnv("PB_POCKETKEY_LOCKED_RSSI", fallback: -78)
    let trustedRssi = intEnv("PB_POCKETKEY_TRUSTED_RSSI", fallback: -62)
    let lockAfterSeconds = durationEnv("PB_POCKETKEY_LOCK_SECONDS", fallback: 8)
    let awayAfterSeconds = min(durationEnv("PB_POCKETKEY_AWAY_SECONDS", fallback: 3), lockAfterSeconds)
    return PocketKeyThresholds(
      trustedRssi: trustedRssi,
      lockedRssi: lockedRssi,
      awayAfterSeconds: awayAfterSeconds,
      lockAfterSeconds: lockAfterSeconds
    )
  }
}

struct TransferRequest: Decodable {
  let item: TransferItem
  let share: ShareEnvelope
}

struct TransferItem: Decodable {
  let id: String
  let kind: String
  let title: String
  let source: String?
  let sourceDevice: String?
  let mimeType: String?
  let size: Int?
  let filePath: String?
  let text: String?
  let createdAt: String
}

struct ShareEnvelope: Decodable {
  let id: String
  let itemId: String
  let target: String
  let status: String
  let createdAt: String
}

struct TransferResponse: Encodable {
  let id: String
  let itemId: String
  let channel: String
  let status: String
  let chunkSizeBytes: Int
  let createdAt: String
}

struct PendingTransfer {
  let response: TransferResponse
  let frames: [Data]
  var nextFrameIndex: Int = 0
}

struct MacLockCommand {
  let executable: String
  let arguments: [String]
  let label: String
}

private let macLockCommands = [
  MacLockCommand(
    executable: "/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession",
    arguments: ["-suspend"],
    label: "CGSession -suspend"
  ),
  MacLockCommand(
    executable: "/usr/bin/osascript",
    arguments: ["-e", #"tell application "System Events" to keystroke "q" using {control down, command down}"#],
    label: "osascript control-command-q"
  ),
  MacLockCommand(
    executable: "/usr/bin/pmset",
    arguments: ["displaysleepnow"],
    label: "pmset displaysleepnow"
  )
]

enum PocketKeyState: String {
  case unknown
  case trusted
  case away
  case locked
}

final class PocketBridgeBLEAgent: NSObject, CBPeripheralManagerDelegate, CBCentralManagerDelegate {
  private var peripheralManager: CBPeripheralManager!
  private var centralManager: CBCentralManager!
  private var downlinkCharacteristic: CBMutableCharacteristic!
  private var uplinkCharacteristic: CBMutableCharacteristic!
  private var listener: NWListener?
  private var pendingTransfers: [PendingTransfer] = []
  private var subscribedCentrals: Set<CBCentral> = []
  private var lastPocketKeySignalAt: Date?
  private var lastPocketKeyRssi: Int?
  private var pocketKeyState: PocketKeyState = .unknown
  private var pocketKeyTimer: DispatchSourceTimer?
  private var lockIssuedForCurrentLoss = false
  private let thresholds = PocketKeyThresholds.liveDemo()
  private let lockAction = stringEnv("PB_POCKETKEY_LOCK_ACTION", fallback: "system")

  func start() throws {
    peripheralManager = CBPeripheralManager(delegate: self, queue: .main)
    centralManager = CBCentralManager(delegate: self, queue: .main)
    try startHTTPListener()
    agentLog("PocketBridge BLE Agent listening on http://127.0.0.1:\(agentPort)")
    agentLog(
      "PocketKey thresholds: trusted>=\(thresholds.trustedRssi)dBm, locked<=\(thresholds.lockedRssi)dBm, awayAfter=\(Int(thresholds.awayAfterSeconds))s, lockAfter=\(Int(thresholds.lockAfterSeconds))s"
    )
    agentLog("PocketKey lock action: \(lockAction)")
  }

  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    guard peripheral.state == .poweredOn else {
      agentLog("BLE peripheral state is \(peripheral.state.rawValue)")
      return
    }

    downlinkCharacteristic = CBMutableCharacteristic(
      type: downlinkNotifyUUID,
      properties: [.notify],
      value: nil,
      permissions: [.readable]
    )
    uplinkCharacteristic = CBMutableCharacteristic(
      type: uplinkWriteUUID,
      properties: [.write, .writeWithoutResponse],
      value: nil,
      permissions: [.writeable]
    )

    let service = CBMutableService(type: transferServiceUUID, primary: true)
    service.characteristics = [downlinkCharacteristic, uplinkCharacteristic]
    peripheral.add(service)
    peripheral.startAdvertising([
      CBAdvertisementDataServiceUUIDsKey: [transferServiceUUID],
      CBAdvertisementDataLocalNameKey: "PocketBridgeTransferService"
    ])
    agentLog("Advertising PocketBridgeTransferService")
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
    subscribedCentrals.insert(central)
    agentLog("Phone subscribed to downlink, maximumUpdateValueLength=\(central.maximumUpdateValueLength)")
    flushTransfers()
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
    for request in requests {
      if request.characteristic.uuid == uplinkWriteUUID, let value = request.value {
        agentLog("Received BLE ACK/write: \(String(data: value, encoding: .utf8) ?? "\(value.count) bytes")")
      }
      peripheral.respond(to: request, withResult: .success)
    }
  }

  func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
    flushTransfers()
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    guard central.state == .poweredOn else {
      agentLog("BLE central state is \(central.state.rawValue)")
      return
    }

    central.scanForPeripherals(withServices: nil, options: [
      CBCentralManagerScanOptionAllowDuplicatesKey: true
    ])
    startPocketKeyTimeoutMonitor()
    agentLog("Scanning for PocketKeyService")
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    guard advertisesPocketKey(advertisementData) else {
      return
    }

    let rssi = RSSI.intValue
    if rssi == 127 {
      agentLog("Ignoring invalid PocketKey RSSI 127 from \(peripheral.identifier)")
      return
    }

    agentLog("PocketKey RSSI \(rssi) from \(peripheral.identifier)")
    lastPocketKeySignalAt = Date()
    lastPocketKeyRssi = rssi

    if rssi <= thresholds.lockedRssi {
      updatePocketKeyState(.locked, reason: "RSSI \(rssi) <= \(thresholds.lockedRssi)", shouldLock: true)
    } else if rssi < thresholds.trustedRssi {
      updatePocketKeyState(.away, reason: "RSSI \(rssi) between trusted and locked thresholds")
    } else {
      updatePocketKeyState(.trusted, reason: "RSSI \(rssi) >= \(thresholds.trustedRssi)")
    }
  }

  private func advertisesPocketKey(_ advertisementData: [String: Any]) -> Bool {
    let serviceKeys = [
      CBAdvertisementDataServiceUUIDsKey,
      CBAdvertisementDataOverflowServiceUUIDsKey,
      CBAdvertisementDataSolicitedServiceUUIDsKey
    ]

    return serviceKeys.contains { key in
      guard let serviceUUIDs = advertisementData[key] as? [CBUUID] else {
        return false
      }
      return serviceUUIDs.contains(pocketKeyServiceUUID)
    }
  }

  private func startHTTPListener() throws {
    let listener = try NWListener(using: .tcp, on: agentPort)
    listener.newConnectionHandler = { [weak self] connection in
      self?.handle(connection)
    }
    listener.start(queue: .main)
    self.listener = listener
  }

  private func handle(_ connection: NWConnection) {
    connection.start(queue: .main)
    connection.receive(minimumIncompleteLength: 1, maximumLength: 1_048_576) { [weak self] data, _, _, _ in
      guard let self else {
        connection.cancel()
        return
      }

      guard let data, let requestText = String(data: data, encoding: .utf8) else {
        self.respond(connection, status: 400, body: #"{"error":"bad request"}"#)
        return
      }

      if requestText.hasPrefix("GET /status ") || requestText.hasPrefix("GET /health ") {
        self.respond(connection, status: 200, body: self.statusBody())
        return
      }

      if requestText.hasPrefix("POST /lock ") {
        self.lockMac()
        self.respond(connection, status: 200, body: #"{"status":"locked"}"#)
        return
      }

      guard requestText.hasPrefix("POST /transfers ") else {
        self.respond(connection, status: 404, body: #"{"error":"not found"}"#)
        return
      }

      guard let bodyStart = requestText.range(of: "\r\n\r\n")?.upperBound else {
        self.respond(connection, status: 400, body: #"{"error":"missing body"}"#)
        return
      }

      let body = Data(requestText[bodyStart...].utf8)
      do {
        let request = try JSONDecoder().decode(TransferRequest.self, from: body)
        let response = try self.queue(request)
        let encoded = try JSONEncoder().encode(response)
        self.respond(connection, status: 200, body: String(data: encoded, encoding: .utf8) ?? "{}")
      } catch {
        self.respond(connection, status: 422, body: #"{"error":"invalid transfer"}"#)
      }
    }
  }

  private func statusBody() -> String {
    let lastSeenAge = lastPocketKeySignalAt.map { Int(Date().timeIntervalSince($0)) }
    let lastRssi = lastPocketKeyRssi.map(String.init) ?? "null"
    let age = lastSeenAge.map(String.init) ?? "null"
    return """
    {"ok":true,"service":"PocketBridgeBLEAgent","pocketKey":{"state":"\(pocketKeyState.rawValue)","lastRssi":\(lastRssi),"lastSeenAgeSeconds":\(age),"lockAction":"\(lockAction)","thresholds":{"trustedRssi":\(thresholds.trustedRssi),"lockedRssi":\(thresholds.lockedRssi),"awayAfterSeconds":\(Int(thresholds.awayAfterSeconds)),"lockAfterSeconds":\(Int(thresholds.lockAfterSeconds))}},"transfer":{"pending":\(pendingTransfers.count),"subscribers":\(subscribedCentrals.count)}}
    """
  }

  private func queue(_ request: TransferRequest) throws -> TransferResponse {
    let payload: Data
    if let filePath = request.item.filePath {
      payload = try Data(contentsOf: URL(fileURLWithPath: filePath))
    } else {
      payload = Data((request.item.text ?? request.item.title).utf8)
    }

    let checksum = SHA256.hash(data: payload).map { String(format: "%02x", $0) }.joined()
    let metadata = [
      "type": "metadata",
      "transferId": request.share.id,
      "itemId": request.item.id,
      "title": request.item.title,
      "mimeType": request.item.mimeType ?? "application/octet-stream",
      "size": String(payload.count),
      "sha256": checksum
    ]
    let metadataFrame = try JSONSerialization.data(withJSONObject: metadata)
    let chunks = stride(from: 0, to: payload.count, by: chunkSizeBytes).map { offset in
      payload.subdata(in: offset..<min(offset + chunkSizeBytes, payload.count))
    }
    let doneFrame = Data(#"{"type":"done"}"#.utf8)
    let response = TransferResponse(
      id: request.share.id,
      itemId: request.item.id,
      channel: "ble",
      status: "queued",
      chunkSizeBytes: chunkSizeBytes,
      createdAt: request.share.createdAt
    )

    pendingTransfers.append(PendingTransfer(response: response, frames: [metadataFrame] + chunks + [doneFrame]))
    agentLog("Queued BLE transfer \(request.share.id): \(chunks.count) chunks, \(payload.count) bytes, SHA-256 \(checksum)")
    flushTransfers()
    return response
  }

  private func flushTransfers() {
    guard !subscribedCentrals.isEmpty, downlinkCharacteristic != nil else {
      return
    }

    while !pendingTransfers.isEmpty {
      var transfer = pendingTransfers.removeFirst()
      while transfer.nextFrameIndex < transfer.frames.count {
        let frame = transfer.frames[transfer.nextFrameIndex]
        let sent = peripheralManager.updateValue(frame, for: downlinkCharacteristic, onSubscribedCentrals: nil)
        if !sent {
          pendingTransfers.insert(transfer, at: 0)
          return
        }
        transfer.nextFrameIndex += 1
      }
      agentLog("Sent BLE transfer \(transfer.response.id)")
    }
  }

  private func startPocketKeyTimeoutMonitor() {
    guard pocketKeyTimer == nil else {
      return
    }

    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now() + 1, repeating: 1)
    timer.setEventHandler { [weak self] in
      self?.checkPocketKeyTimeout()
    }
    timer.resume()
    pocketKeyTimer = timer
  }

  private func checkPocketKeyTimeout() {
    guard let lastPocketKeySignalAt else {
      return
    }

    let age = Date().timeIntervalSince(lastPocketKeySignalAt)
    if age >= thresholds.lockAfterSeconds {
      updatePocketKeyState(.locked, reason: "no PocketKey signal for \(Int(age))s", shouldLock: true)
    } else if age >= thresholds.awayAfterSeconds {
      updatePocketKeyState(.away, reason: "no PocketKey signal for \(Int(age))s")
    }
  }

  private func updatePocketKeyState(_ nextState: PocketKeyState, reason: String, shouldLock: Bool = false) {
    if nextState != pocketKeyState {
      agentLog("PocketKey state \(pocketKeyState.rawValue) -> \(nextState.rawValue): \(reason)")
      pocketKeyState = nextState
    }

    if nextState == .trusted {
      lockIssuedForCurrentLoss = false
      return
    }

    if shouldLock && !lockIssuedForCurrentLoss {
      lockIssuedForCurrentLoss = true
      // CGSession -suspend
      lockMac()
    }
  }

  private func respond(_ connection: NWConnection, status: Int, body: String) {
    let reason = status == 200 ? "OK" : "Error"
    let response = """
    HTTP/1.1 \(status) \(reason)\r
    content-type: application/json\r
    content-length: \(body.utf8.count)\r
    connection: close\r
    \r
    \(body)
    """
    connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in
      connection.cancel()
    })
  }

  private func lockMac() {
    guard lockAction == "system" else {
      agentLog("Demo lock action requested; macOS system lock skipped")
      return
    }

    for command in macLockCommands {
      guard FileManager.default.isExecutableFile(atPath: command.executable) else {
        agentLog("Skipping unavailable macOS lock command: \(command.label)")
        continue
      }

      let process = Process()
      process.executableURL = URL(fileURLWithPath: command.executable)
      process.arguments = command.arguments
      do {
        try process.run()
        process.waitUntilExit()
        if process.terminationStatus == 0 {
          agentLog("Executed macOS lock command: \(command.label)")
          return
        }
        agentLog("macOS lock command failed with status \(process.terminationStatus): \(command.label)")
      } catch {
        agentLog("Failed to execute macOS lock command \(command.label): \(error)")
      }
    }

    agentLog("No macOS lock command succeeded")
  }
}

let agent = PocketBridgeBLEAgent()
do {
  try agent.start()
  dispatchMain()
} catch {
  fputs("PocketBridge BLE Agent failed: \(error)\n", stderr)
  exit(1)
}
