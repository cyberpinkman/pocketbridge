import Foundation
import UniformTypeIdentifiers

struct BridgeAPI {
  var serverBaseURL = URL(string: "http://127.0.0.1:3000")!
  var agentBaseURL = URL(string: "http://127.0.0.1:41237")!

  func fetchHealth() async throws -> HealthResponse {
    try await decodedRequest("/health", as: HealthResponse.self)
  }

  func createPairing() async throws -> PairingPayload {
    try await decodedRequest("/api/pairing", as: PairingPayload.self)
  }

  func fetchPairingQR(pairCode: String) async throws -> PairingQRCode {
    var components = URLComponents(url: serverBaseURL.appendingPath("/api/pairing/qr.svg"), resolvingAgainstBaseURL: false)!
    components.queryItems = [URLQueryItem(name: "pairCode", value: pairCode)]
    let (data, response) = try await URLSession.shared.data(from: components.url!)
    try validate(response: response, data: data)
    return PairingQRCode(pairCode: pairCode, svg: String(decoding: data, as: UTF8.self))
  }

  func fetchItems(pairCode: String) async throws -> [BridgeItem] {
    let response = try await decodedRequest(
      "/api/items?limit=80",
      pairCode: pairCode,
      as: ItemsResponse.self
    )
    return response.items
  }

  func fetchBleStatus(pairCode: String) async throws -> BleStatus {
    try await decodedRequest("/api/ble/status", pairCode: pairCode, as: BleStatus.self)
  }

  func fetchAgentStatus() async throws -> AgentStatus {
    try await decodedAgentRequest("/status", as: AgentStatus.self)
  }

  func addText(_ text: String, pairCode: String) async throws -> BridgeItem {
    let title = text.count > 48 ? String(text.prefix(48)) : text
    let body: [String: Any] = [
      "title": title,
      "text": text,
      "origin": "mac",
      "sourceDevice": "PocketBridge Mac Client",
      "tags": ["mac-client"]
    ]
    let response = try await decodedRequest(
      "/api/items/text",
      method: "POST",
      pairCode: pairCode,
      jsonBody: body,
      as: ItemResponse.self
    )
    return response.item
  }

  func uploadFile(_ fileURL: URL, pairCode: String) async throws -> BridgeItem {
    let boundary = "PocketBridge-\(UUID().uuidString)"
    var request = URLRequest(url: serverBaseURL.appendingPath("/api/items/upload"))
    request.httpMethod = "POST"
    request.setValue(pairCode, forHTTPHeaderField: "X-PocketBridge-Pair-Code")
    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

    var body = Data()
    appendFormField("origin", value: "mac", boundary: boundary, body: &body)
    appendFormField("sourceDevice", value: "PocketBridge Mac Client", boundary: boundary, body: &body)
    appendFormField("title", value: fileURL.lastPathComponent, boundary: boundary, body: &body)
    appendFormField("tags", value: #"["mac-client"]"#, boundary: boundary, body: &body)

    let fileData = try Data(contentsOf: fileURL)
    let mimeType = UTType(filenameExtension: fileURL.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
    body.append("--\(boundary)\r\n")
    body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileURL.lastPathComponent)\"\r\n")
    body.append("Content-Type: \(mimeType)\r\n\r\n")
    body.append(fileData)
    body.append("\r\n--\(boundary)--\r\n")

    let (data, response) = try await URLSession.shared.upload(for: request, from: body)
    try validate(response: response, data: data)
    return try JSONDecoder().decode(ItemResponse.self, from: data).item
  }

  func sendToPhone(itemId: String, pairCode: String) async throws -> BridgeItem {
    let response = try await decodedRequest(
      "/api/items/\(itemId)/share-to-mobile",
      method: "POST",
      pairCode: pairCode,
      jsonBody: ["sharedToMobile": true],
      as: ItemResponse.self
    )
    return response.item
  }

  func sendByBluetooth(itemId: String, pairCode: String) async throws -> BleSendResponse {
    try await decodedRequest(
      "/api/ble/send/\(itemId)",
      method: "POST",
      pairCode: pairCode,
      jsonBody: [:],
      as: BleSendResponse.self
    )
  }

  func exportToKnowledge(itemId: String, pairCode: String) async throws -> BridgeItem {
    let response = try await decodedRequest(
      "/api/knowledge/\(itemId)",
      method: "POST",
      pairCode: pairCode,
      jsonBody: [:],
      as: ItemResponse.self
    )
    return response.item
  }

  func importSnapzy() async throws -> Int {
    var request = URLRequest(url: serverBaseURL.appendingPath("/snapzy/import"))
    request.httpMethod = "POST"
    let (data, response) = try await URLSession.shared.data(for: request)
    try validate(response: response, data: data)
    let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    return (object?["items"] as? [Any])?.count ?? 0
  }

  func lockMacNow() async throws {
    var request = URLRequest(url: agentBaseURL.appendingPath("/lock"))
    request.httpMethod = "POST"
    let (data, response) = try await URLSession.shared.data(for: request)
    try validate(response: response, data: data)
  }

  private func decodedRequest<T: Decodable>(
    _ path: String,
    method: String = "GET",
    pairCode: String? = nil,
    jsonBody: [String: Any]? = nil,
    as type: T.Type
  ) async throws -> T {
    var request = URLRequest(url: serverBaseURL.appendingPath(path))
    request.httpMethod = method
    if let pairCode {
      request.setValue(pairCode, forHTTPHeaderField: "X-PocketBridge-Pair-Code")
    }
    if let jsonBody {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONSerialization.data(withJSONObject: jsonBody)
    }
    let (data, response) = try await URLSession.shared.data(for: request)
    try validate(response: response, data: data)
    return try JSONDecoder().decode(type, from: data)
  }

  private func decodedAgentRequest<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
    let (data, response) = try await URLSession.shared.data(from: agentBaseURL.appendingPath(path))
    try validate(response: response, data: data)
    return try JSONDecoder().decode(type, from: data)
  }

  private func validate(response: URLResponse, data: Data) throws {
    guard let http = response as? HTTPURLResponse else {
      throw BridgeAPIError("No HTTP response")
    }
    guard (200..<300).contains(http.statusCode) else {
      let body = String(decoding: data, as: UTF8.self)
      throw BridgeAPIError("HTTP \(http.statusCode): \(body)")
    }
  }

  private func appendFormField(_ name: String, value: String, boundary: String, body: inout Data) {
    body.append("--\(boundary)\r\n")
    body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
    body.append(value)
    body.append("\r\n")
  }
}

struct BridgeAPIError: LocalizedError {
  let message: String

  init(_ message: String) {
    self.message = message
  }

  var errorDescription: String? {
    message
  }
}

private extension URL {
  func appendingPath(_ path: String) -> URL {
    if path.hasPrefix("/") {
      return URL(string: absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path)!
    }
    return appendingPathComponent(path)
  }
}

private extension Data {
  mutating func append(_ string: String) {
    append(Data(string.utf8))
  }
}
