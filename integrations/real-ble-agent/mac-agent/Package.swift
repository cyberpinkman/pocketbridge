// swift-tools-version: 5.9

import PackageDescription

let package = Package(
  name: "PocketBridgeBLEAgent",
  platforms: [
    .macOS(.v13)
  ],
  products: [
    .executable(name: "PocketBridgeBLEAgent", targets: ["PocketBridgeBLEAgent"])
  ],
  targets: [
    .executableTarget(name: "PocketBridgeBLEAgent")
  ]
)
