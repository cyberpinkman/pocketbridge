import Foundation

struct HealthResponse: Decodable {
  let ok: Bool
  let service: String
  let name: String
  let trust: TrustState
}

struct TrustState: Decodable {
  let trusted: Bool
  let reason: String
  let updatedAt: String
}

struct PairingPayload: Decodable {
  let version: Int
  let serverBaseUrl: String
  let wsUrl: String
  let pairCode: String
  let deviceName: String
  let expiresAt: String
  let capabilities: [String]

  enum CodingKeys: String, CodingKey {
    case version
    case serverBaseUrl
    case wsUrl
    case pairCode
    case deviceName
    case expiresAt
    case capabilities
  }
}

struct PairingQRCode {
  let pairCode: String
  let svg: String
}

struct ItemsResponse: Decodable {
  let items: [BridgeItem]
}

struct ItemResponse: Decodable {
  let item: BridgeItem
}

struct BleSendResponse: Decodable {
  let item: BridgeItem
  let transfer: BleTransfer
}

struct BleTransfer: Decodable {
  let id: String
  let itemId: String
  let channel: String
  let status: String
  let chunkSizeBytes: Int
  let createdAt: String
}

struct BridgeItem: Decodable, Identifiable, Hashable {
  let id: String
  let kind: String
  let title: String
  let origin: String
  let sourceDevice: String
  let mimeType: String?
  let sizeBytes: Int?
  let originalFilename: String?
  let text: String?
  let tags: [String]
  let sharedToMobile: Bool
  let status: String
  let createdAt: String
  let updatedAt: String
  let downloadUrl: String?
  let knowledgePath: String?

  var displayKind: String {
    switch kind {
    case "screenshot": return "Screenshot"
    case "image": return "Image"
    case "text": return "Text"
    default: return "File"
    }
  }

  var displaySize: String {
    guard let sizeBytes else {
      return "Text"
    }
    if sizeBytes < 1024 {
      return "\(sizeBytes) B"
    }
    if sizeBytes < 1024 * 1024 {
      return "\(sizeBytes / 1024) KB"
    }
    return String(format: "%.1f MB", Double(sizeBytes) / 1024 / 1024)
  }

  var displayUpdatedAt: String {
    updatedAt.replacingOccurrences(of: "T", with: " ").prefix(19).description
  }
}

struct BleStatus: Decodable {
  let status: String
  let deviceName: String
  let rssi: Int?
  let lockState: String?
  let lastSignalAt: String?
  let updatedAt: String
}

struct AgentStatus: Decodable {
  let ok: Bool
  let service: String
  let pocketKey: AgentPocketKey
  let transfer: AgentTransfer
}

struct AgentPocketKey: Decodable {
  let state: String
  let lastRssi: Int?
  let lastSeenAgeSeconds: Int?
  let lockAction: String?
  let thresholds: AgentThresholds
}

struct AgentThresholds: Decodable {
  let trustedRssi: Int
  let lockedRssi: Int
  let awayAfterSeconds: Int
  let lockAfterSeconds: Int
}

struct AgentTransfer: Decodable {
  let pending: Int
  let subscribers: Int
}

enum ServiceRunState: String {
  case offline = "Offline"
  case external = "Running"
  case owned = "Started by client"
  case starting = "Starting"
  case failed = "Failed"
}

struct ClientLogEntry: Identifiable {
  let id = UUID()
  let date = Date()
  let source: String
  let message: String

  var timestamp: String {
    let formatter = DateFormatter()
    formatter.dateFormat = "HH:mm:ss"
    return formatter.string(from: date)
  }
}
