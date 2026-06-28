import SwiftUI
import UniformTypeIdentifiers

struct DashboardView: View {
  @StateObject private var model = BridgeDashboardModel()
  @State private var isImportingFile = false

  var body: some View {
    HStack(spacing: 0) {
      sidebar
        .frame(width: 340)
      Divider()
      workspace
    }
    .frame(minWidth: 1180, minHeight: 760)
    .background(Color(nsColor: .windowBackgroundColor))
    .task {
      await model.bootstrap()
    }
    .fileImporter(isPresented: $isImportingFile, allowedContentTypes: [.item]) { result in
      if case .success(let url) = result {
        Task { await model.uploadFile(url) }
      }
    }
  }

  private var sidebar: some View {
    VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 8) {
        Text("PocketBridge")
          .font(.system(size: 28, weight: .semibold))
        Text("Mac Client")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(.secondary)
      }

      serviceControls
      pairingPanel
      logPanel
    }
    .padding(20)
  }

  private var serviceControls: some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionTitle("Demo Stack", systemImage: "switch.2")
      ServiceRow(title: "Node Bridge", state: model.serverState, detail: "http://127.0.0.1:3000")
      ServiceRow(title: "BLE Agent", state: model.agentState, detail: "http://127.0.0.1:41237")

      HStack(spacing: 10) {
        Button {
          Task { await model.startDemoStack() }
        } label: {
          Label(model.isStarting ? "Starting" : "Start", systemImage: "play.fill")
        }
        .buttonStyle(.borderedProminent)
        .disabled(model.isStarting)

        Button {
          Task { await model.refresh() }
        } label: {
          Label("Refresh", systemImage: "arrow.clockwise")
        }
        .buttonStyle(.bordered)

        Button {
          model.stopOwnedStack()
        } label: {
          Label("Stop", systemImage: "stop.fill")
        }
        .buttonStyle(.bordered)
      }

      Button {
        model.revealRepoRoot()
      } label: {
        Label("Reveal Project", systemImage: "folder")
      }
      .buttonStyle(.plain)
      .foregroundStyle(.secondary)
    }
  }

  private var pairingPanel: some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionTitle("Pairing", systemImage: "qrcode")
      if let qrCode = model.qrCode {
        QRCodeView(svg: qrCode.svg)
          .frame(height: 168)
          .clipShape(RoundedRectangle(cornerRadius: 8))
          .overlay(RoundedRectangle(cornerRadius: 8).stroke(.quaternary))
      } else {
        PlaceholderPane(title: "No QR yet", systemImage: "qrcode.viewfinder")
          .frame(height: 168)
      }

      HStack {
        VStack(alignment: .leading, spacing: 4) {
          Text("Pair Code")
            .font(.caption)
            .foregroundStyle(.secondary)
          Text(model.pairCode ?? "------")
            .font(.system(size: 28, weight: .semibold, design: .monospaced))
        }
        Spacer()
        Button {
          Task { await model.createNewPairing() }
        } label: {
          Image(systemName: "arrow.triangle.2.circlepath")
        }
        .help("Create a new pairing code")

        Button {
          model.copyPairingPayload()
        } label: {
          Image(systemName: "doc.on.doc")
        }
        .help("Copy pairing payload")
        .disabled(model.pairCode == nil)
      }
    }
  }

  private var logPanel: some View {
    VStack(alignment: .leading, spacing: 10) {
      SectionTitle("Activity", systemImage: "terminal")
      ScrollViewReader { proxy in
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 6) {
            ForEach(model.logs) { entry in
              Text("[\(entry.timestamp)] \(entry.source): \(entry.message)")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .id(entry.id)
            }
          }
          .padding(10)
        }
        .frame(minHeight: 150)
        .background(Color(nsColor: .textBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(.quaternary))
        .onChange(of: model.logs.count) { _ in
          if let last = model.logs.last {
            proxy.scrollTo(last.id, anchor: .bottom)
          }
        }
      }
    }
  }

  private var workspace: some View {
    VStack(spacing: 0) {
      statusHeader
      Divider()
      HSplitView {
        inboxPane
          .frame(minWidth: 430)
        itemDetailPane
          .frame(minWidth: 390)
      }
    }
  }

  private var statusHeader: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text("Live Demo Console")
          .font(.system(size: 24, weight: .semibold))
        Spacer()
        if let error = model.lastError {
          Label(error, systemImage: "exclamationmark.triangle.fill")
            .font(.caption)
            .foregroundStyle(.orange)
            .lineLimit(1)
        }
      }

      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4), spacing: 12) {
        MetricTile(
          title: "Bridge",
          value: model.health?.ok == true ? "Online" : "Offline",
          detail: model.health?.trust.reason ?? "Waiting for server",
          systemImage: "network"
        )
        MetricTile(
          title: "PocketKey",
          value: model.agentStatus?.pocketKey.state.capitalized ?? "Unknown",
          detail: pocketKeyDetail,
          systemImage: "lock.shield"
        )
        MetricTile(
          title: "RSSI",
          value: model.agentStatus?.pocketKey.lastRssi.map { "\($0) dBm" } ?? "--",
          detail: thresholdDetail,
          systemImage: "dot.radiowaves.left.and.right"
        )
        MetricTile(
          title: "Inbox",
          value: "\(model.items.count)",
          detail: "\(model.items.filter(\.sharedToMobile).count) queued for phone",
          systemImage: "tray.full"
        )
      }

      HStack(spacing: 10) {
        Button {
          isImportingFile = true
        } label: {
          Label("Upload File", systemImage: "square.and.arrow.up")
        }
        .buttonStyle(.borderedProminent)
        .disabled(model.pairCode == nil)

        Button {
          Task { await model.captureScreen() }
        } label: {
          Label("Capture Screen", systemImage: "camera.viewfinder")
        }
        .buttonStyle(.bordered)
        .disabled(model.pairCode == nil)

        Button {
          Task { await model.importSnapzy() }
        } label: {
          Label("Import Snapzy", systemImage: "camera.viewfinder")
        }
        .buttonStyle(.bordered)

        Button {
          Task { await model.sendSelectedToPhone() }
        } label: {
          Label("Send to Phone", systemImage: "iphone.radiowaves.left.and.right")
        }
        .buttonStyle(.bordered)
        .disabled(model.selectedItem == nil || model.pairCode == nil)

        Button {
          Task { await model.sendSelectedByBluetooth() }
        } label: {
          Label("Send by Bluetooth", systemImage: "dot.radiowaves.left.and.right")
        }
        .buttonStyle(.bordered)
        .disabled(model.selectedItem == nil || model.pairCode == nil)

        Button {
          Task { await model.exportSelectedToKnowledge() }
        } label: {
          Label("Save Knowledge", systemImage: "book.closed")
        }
        .buttonStyle(.bordered)
        .disabled(model.selectedItem == nil || model.pairCode == nil)

        Spacer()

        Button(role: .destructive) {
          Task { await model.lockMacNow() }
        } label: {
          Label("Lock Mac", systemImage: "lock.fill")
        }
        .buttonStyle(.bordered)
        .disabled(model.agentStatus == nil)
      }
    }
    .padding(20)
  }

  private var inboxPane: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        SectionTitle("PocketInbox", systemImage: "tray")
        Spacer()
        Button {
          Task { await model.refresh() }
        } label: {
          Image(systemName: "arrow.clockwise")
        }
        .help("Refresh inbox")
      }

      HStack(alignment: .top, spacing: 10) {
        TextEditor(text: $model.quickText)
          .font(.body)
          .frame(height: 76)
          .scrollContentBackground(.hidden)
          .background(Color(nsColor: .textBackgroundColor))
          .clipShape(RoundedRectangle(cornerRadius: 8))
          .overlay(RoundedRectangle(cornerRadius: 8).stroke(.quaternary))

        Button {
          Task { await model.addQuickText() }
        } label: {
          Image(systemName: "plus")
            .frame(width: 28, height: 28)
        }
        .help("Add text to PocketInbox")
        .disabled(model.quickText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.pairCode == nil)
      }

      List(selection: $model.selectedItemId) {
        ForEach(model.items) { item in
          ItemRow(item: item)
            .tag(item.id)
        }
      }
      .listStyle(.inset)
    }
    .padding(20)
  }

  private var itemDetailPane: some View {
    VStack(alignment: .leading, spacing: 14) {
      SectionTitle("Selected Item", systemImage: "doc.text.magnifyingglass")
      if let item = model.selectedItem {
        VStack(alignment: .leading, spacing: 14) {
          Text(item.title)
            .font(.system(size: 22, weight: .semibold))
            .lineLimit(2)
          HStack {
            Badge(text: item.displayKind, systemImage: "doc")
            Badge(text: item.origin.capitalized, systemImage: "arrow.up.right")
            Badge(text: item.displaySize, systemImage: "externaldrive")
          }

          DetailRow(label: "Status", value: item.status)
          DetailRow(label: "Source", value: item.sourceDevice)
          DetailRow(label: "Updated", value: item.displayUpdatedAt)
          if item.sharedToMobile {
            DetailRow(label: "Phone", value: "Queued")
          }
          if let knowledgePath = item.knowledgePath {
            DetailRow(label: "Knowledge", value: knowledgePath)
          }

          if let text = item.text, !text.isEmpty {
            ScrollView {
              Text(text)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
                .padding(12)
            }
            .background(Color(nsColor: .textBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(.quaternary))
          } else {
            PlaceholderPane(title: "File-backed item", systemImage: "doc.badge.arrow.up")
          }

          Spacer()
        }
      } else {
        PlaceholderPane(title: "No item selected", systemImage: "tray")
        Spacer()
      }
    }
    .padding(20)
  }

  private var pocketKeyDetail: String {
    guard let status = model.agentStatus else {
      return "Agent status unavailable"
    }
    let age = status.pocketKey.lastSeenAgeSeconds.map { "\($0)s ago" } ?? "no signal"
    return "\(age), \(status.transfer.subscribers) phone subscriber(s)"
  }

  private var thresholdDetail: String {
    guard let thresholds = model.agentStatus?.pocketKey.thresholds else {
      return "locked <= -78 dBm"
    }
    return "trusted >= \(thresholds.trustedRssi), locked <= \(thresholds.lockedRssi)"
  }
}

struct SectionTitle: View {
  let text: String
  let systemImage: String

  init(_ text: String, systemImage: String) {
    self.text = text
    self.systemImage = systemImage
  }

  var body: some View {
    Label(text, systemImage: systemImage)
      .font(.system(size: 13, weight: .semibold))
      .foregroundStyle(.secondary)
  }
}

struct ServiceRow: View {
  let title: String
  let state: ServiceRunState
  let detail: String

  var body: some View {
    HStack(spacing: 10) {
      Circle()
        .fill(color)
        .frame(width: 9, height: 9)
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(.system(size: 13, weight: .medium))
        Text("\(state.rawValue) · \(detail)")
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      Spacer()
    }
  }

  private var color: Color {
    switch state {
    case .owned, .external: return .green
    case .starting: return .yellow
    case .failed: return .red
    case .offline: return .secondary
    }
  }
}

struct MetricTile: View {
  let title: String
  let value: String
  let detail: String
  let systemImage: String

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Label(title, systemImage: systemImage)
          .font(.caption)
          .foregroundStyle(.secondary)
        Spacer()
      }
      Text(value)
        .font(.system(size: 24, weight: .semibold))
        .lineLimit(1)
      Text(detail)
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(2)
        .frame(minHeight: 30, alignment: .topLeading)
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color(nsColor: .controlBackgroundColor))
    .clipShape(RoundedRectangle(cornerRadius: 8))
    .overlay(RoundedRectangle(cornerRadius: 8).stroke(.quaternary))
  }
}

struct ItemRow: View {
  let item: BridgeItem

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: icon)
        .font(.system(size: 18))
        .foregroundStyle(.secondary)
        .frame(width: 26)
      VStack(alignment: .leading, spacing: 4) {
        Text(item.title)
          .font(.system(size: 14, weight: .medium))
          .lineLimit(1)
        Text("\(item.displayKind) · \(item.origin.capitalized) · \(item.displayUpdatedAt)")
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      Spacer()
      if item.sharedToMobile {
        Image(systemName: "iphone.radiowaves.left.and.right")
          .foregroundStyle(.blue)
      }
      if item.status == "saved_to_knowledge" {
        Image(systemName: "book.closed")
          .foregroundStyle(.green)
      }
    }
    .padding(.vertical, 5)
  }

  private var icon: String {
    switch item.kind {
    case "text": return "text.alignleft"
    case "image", "screenshot": return "photo"
    default: return "doc"
    }
  }
}

struct DetailRow: View {
  let label: String
  let value: String

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(label)
        .foregroundStyle(.secondary)
        .frame(width: 86, alignment: .leading)
      Text(value)
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .font(.system(size: 13))
  }
}

struct Badge: View {
  let text: String
  let systemImage: String

  var body: some View {
    Label(text, systemImage: systemImage)
      .font(.caption)
      .padding(.horizontal, 8)
      .padding(.vertical, 5)
      .background(Color(nsColor: .controlBackgroundColor))
      .clipShape(RoundedRectangle(cornerRadius: 8))
  }
}

struct PlaceholderPane: View {
  let title: String
  let systemImage: String

  var body: some View {
    VStack(spacing: 8) {
      Image(systemName: systemImage)
        .font(.system(size: 28))
        .foregroundStyle(.secondary)
      Text(title)
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(nsColor: .controlBackgroundColor))
    .clipShape(RoundedRectangle(cornerRadius: 8))
    .overlay(RoundedRectangle(cornerRadius: 8).stroke(.quaternary))
  }
}
