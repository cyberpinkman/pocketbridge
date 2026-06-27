import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export interface CommandStatus {
  ok: boolean;
  output: string;
}

export interface EnvironmentStatus {
  node: CommandStatus;
  npm: CommandStatus;
  flutter: CommandStatus;
  dart: CommandStatus;
}

export type CommandRunner = (command: string, args: string[]) => CommandStatus;

export function getEnvironmentStatus(runner: CommandRunner = runCommand): EnvironmentStatus {
  return {
    node: runner("node", ["--version"]),
    npm: runner("npm", ["--version"]),
    flutter: runner("flutter", ["--version"]),
    dart: runner("dart", ["--version"])
  };
}

export function formatEnvironmentReport(status: EnvironmentStatus): string {
  const lines = [
    "PocketBridge environment check",
    "",
    formatLine("Node", status.node),
    formatLine("npm", status.npm),
    formatLine("Flutter", status.flutter),
    formatLine("Dart", status.dart)
  ];

  if (!status.flutter.ok || !status.dart.ok) {
    lines.push(
      "",
      "Flutter mobile compile/run is blocked on this machine.",
      "Use the browser fallback at http://<Mac-LAN-IP>:3000/mobile.html for the live demo."
    );
  }

  return lines.join("\n");
}

function formatLine(label: string, status: CommandStatus): string {
  return `${label}: ${status.ok ? "OK" : "BLOCKED"}${status.output ? ` (${firstLine(status.output)})` : ""}`;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).find(Boolean) ?? "";
}

function runCommand(command: string, args: string[]): CommandStatus {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.error) {
    return { ok: false, output: result.error.message };
  }

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return {
    ok: result.status === 0,
    output
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(formatEnvironmentReport(getEnvironmentStatus()));
}
