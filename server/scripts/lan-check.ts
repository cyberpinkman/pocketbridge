import { runLanPreflight } from "../src/lanPreflight.js";

function log(label: string, value: string): void {
  console.log(`[lan-check] ${label}: ${value}`);
}

try {
  const result = await runLanPreflight();
  log("public host", result.publicHost);
  log("local probe", result.localBaseUrl);
  log("pair code", result.pairCode);
  log("Mac UI", result.macUiUrl);
  log("mobile fallback", result.mobileFallbackUrl);
  log("websocket", result.advertisedWsUrl);
  log("LAN candidates", result.lanAddresses.join(", "));
  log("checks", result.checked.join(" -> "));

  if (result.publicHost === "127.0.0.1") {
    console.warn("[lan-check] PB_PUBLIC_HOST is 127.0.0.1; a physical phone cannot use this address.");
  }
} catch (error) {
  console.error("[lan-check] failed", error);
  process.exitCode = 1;
}
