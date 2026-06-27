import { createPocketBridgeRuntime } from "./app.js";

const runtime = await createPocketBridgeRuntime();

runtime.server.listen(runtime.config.port, () => {
  console.log(`PocketBridge server: ${runtime.config.serverBaseUrl}`);
  console.log(`Pair code: ${runtime.config.pairCode}`);
  console.log(`Mac UI: ${runtime.config.serverBaseUrl}/`);
  console.log(`Mobile fallback: ${runtime.config.serverBaseUrl}/mobile.html`);
  console.log(`LAN candidates: ${runtime.config.lanAddresses.join(", ")}`);
  console.log("If the phone cannot connect, restart with PB_PUBLIC_HOST=<phone-reachable-ip>.");
  console.log(`Snapzy watch: ${runtime.config.snapzyWatchDir}`);
});
