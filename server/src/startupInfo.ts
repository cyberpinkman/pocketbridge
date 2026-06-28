import os from "node:os";

export interface StartupInfoConfig {
  host: string;
  port: number;
  publicHost?: string;
  snapzyWatchDir: string;
}

export function lanUrlCandidates(
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>,
  port: number
): string[] {
  const urls: string[] = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
    }
  }

  return urls;
}

export function currentLanUrlCandidates(port: number): string[] {
  return lanUrlCandidates(os.networkInterfaces(), port);
}

export function formatStartupInfo(config: StartupInfoConfig, lanCandidates: string[]): string[] {
  const baseUrl = publicBaseUrl(config);
  return [
    `PocketBridge local bridge listening on http://${config.host}:${config.port}`,
    `Mac UI: ${baseUrl}/`,
    `Mobile browser fallback: ${baseUrl}/mobile.html`,
    `Snapzy watch folder: ${config.snapzyWatchDir}`,
    `LAN candidates: ${lanCandidates.length > 0 ? lanCandidates.join(", ") : "none detected"}`
  ];
}

export function publicBaseUrl(config: Pick<StartupInfoConfig, "port" | "publicHost">): string {
  const publicHost = config.publicHost?.replace(/\/$/, "");
  if (!publicHost) {
    return `http://127.0.0.1:${config.port}`;
  }
  if (publicHost.startsWith("http://") || publicHost.startsWith("https://")) {
    return publicHost;
  }
  return `http://${publicHost}:${config.port}`;
}
