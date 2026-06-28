import http from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { startSnapzyWatch } from "./integrations/snapzyWatch.js";
import { currentLanUrlCandidates, formatStartupInfo } from "./startupInfo.js";
import { ensureStorage } from "./storage/metadataStore.js";
import { attachWebsocket } from "./websocket/hub.js";

await ensureStorage();
startSnapzyWatch();

const app = createApp();
const server = http.createServer(app);
attachWebsocket(server);

server.listen(config.port, config.host, () => {
  for (const line of formatStartupInfo(config, currentLanUrlCandidates(config.port))) {
    console.log(line);
  }
});
