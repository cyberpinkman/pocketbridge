// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "PocketBridgeMacClient",
  platforms: [
    .macOS(.v13)
  ],
  products: [
    .executable(name: "PocketBridgeMacClient", targets: ["PocketBridgeMacClient"])
  ],
  targets: [
    .executableTarget(name: "PocketBridgeMacClient")
  ]
)
