import { customAlphabet } from "nanoid";
import type { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { Config } from "../config.js";
import type { PocketEvent, PocketEventType } from "../types.js";

export class WebSocketHub {
  private wss?: WebSocketServer;
  private randomEventSuffix = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 8);

  constructor(private readonly config: Config) {}

  attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", (socket, request) => {
      const params = this.params(request);
      if (params.get("pairCode") !== this.config.pairCode) {
        socket.close(1008, "Invalid pair code");
        return;
      }

      this.send(socket, "pairing.connected", {
        client: params.get("client") ?? "unknown",
        deviceName: this.config.deviceName
      });
    });
  }

  broadcast(type: PocketEventType, data: unknown): void {
    if (!this.wss) return;
    const payload = JSON.stringify(this.event(type, data));
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  async close(): Promise<void> {
    const server = this.wss;
    if (!server) return;
    this.wss = undefined;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private send(socket: WebSocket, type: PocketEventType, data: unknown): void {
    socket.send(JSON.stringify(this.event(type, data)));
  }

  private event(type: PocketEventType, data: unknown): PocketEvent {
    return {
      type,
      version: 1,
      eventId: `evt_${Date.now()}_${this.randomEventSuffix()}`,
      sentAt: new Date().toISOString(),
      data
    };
  }

  private params(request: IncomingMessage): URLSearchParams {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    return url.searchParams;
  }
}
