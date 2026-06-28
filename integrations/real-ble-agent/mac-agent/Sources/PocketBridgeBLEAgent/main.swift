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
private let lockCommand = "/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession"

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

final class PocketBridgeBLEAgent: NSObject, CBPeripheralManagerDelegate, CBCentralManagerDelegate {
  private var peripheralManager: CBPeripheralManager!
  private var centralManager: CBCentralManager!
  private var downlinkCharacteristic: CBMutableCharacteristic!
  private var uplinkCharacteristic: CBMutableCharacteristic!
  private var listener: NWListener?
  private var pendingTransfers: [PendingTransfer] = []
  private var subscribedCentrals: Set<CBCentral> = []

  func start() throws {
    peripheralManager = CBPeripheralManager(delegate: self, queue: .main)
    centralManager = CBCentralManager(delegate: self, queue: .main)
    try startHTTPListener()
    print("PocketBridge BLE Agent listening on http://127.0.0.1:\(agentPort)")
  }

  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    guard peripheral.state == .poweredOn else {
      print("BLE peripheral state is \(peripheral.state.rawValue)")
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
    print("Advertising PocketBridgeTransferService")
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
    subscribedCentrals.insert(central)
    print("Phone subscribed to downlink, maximumUpdateValueLength=\(central.maximumUpdateValueLength)")
    flushTransfers()
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
    for request in requests {
      if request.characteristic.uuid == uplinkWriteUUID, let value = request.value {
        print("Received BLE ACK/write: \(String(data: value, encoding: .utf8) ?? "\(value.count) bytes")")
      }
      peripheral.respond(to: request, withResult: .success)
    }
  }

  func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
    flushTransfers()
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    guard central.state == .poweredOn else {
      print("BLE central state is \(central.state.rawValue)")
      return
    }

    central.scanForPeripherals(withServices: [pocketKeyServiceUUID], options: [
      CBCentralManagerScanOptionAllowDuplicatesKey: true
    ])
    print("Scanning for PocketKeyService")
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    print("PocketKey RSSI \(RSSI.intValue) from \(peripheral.identifier)")
    if RSSI.intValue <= -85 {
      // CGSession -suspend
      lockMac()
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

      // POST /transfers
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
    print("Queued BLE transfer \(request.share.id): \(chunks.count) chunks, \(payload.count) bytes, SHA-256 \(checksum)")
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
      print("Sent BLE transfer \(transfer.response.id)")
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
    let process = Process()
    process.executableURL = URL(fileURLWithPath: lockCommand)
    process.arguments = ["-suspend"]
    try? process.run()
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
