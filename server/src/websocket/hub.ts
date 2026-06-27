import path from "node:path";
import { WebSocketServer } from "ws";
import type { Server } from "node:http";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import { readMetadata } from "../storage/metadataStore.js";
import type { BridgeEvent, PocketItem, PocketItemSource } from "../types.js";

type UpstreamClientRole = "mac" | "mobile";

let legacyWebsocketServer: WebSocketServer | undefined;
let upstreamWebsocketServer: WebSocketServer | undefined;

export function attachWebsocket(server: Server): WebSocketServer {
  legacyWebsocketServer = new WebSocketServer({ noServer: true });
  upstreamWebsocketServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url ?? "", "ws://localhost").pathname;
    if (pathname === "/events") {
      legacyWebsocketServer?.handleUpgrade(request, socket, head, (websocket) => {
        legacyWebsocketServer?.emit("connection", websocket, request);
      });
      return;
    }

    if (pathname === "/ws") {
      upstreamWebsocketServer?.handleUpgrade(request, socket, head, (websocket) => {
        upstreamWebsocketServer?.emit("connection", websocket, request);
      });
      return;
    }

    socket.destroy();
  });

  legacyWebsocketServer.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "bridge.connected", createdAt: new Date().toISOString() }));
  });

  upstreamWebsocketServer.on("connection", (socket, request) => {
    void validateUpstreamConnection(request.url ?? "").then((result) => {
      if (!result.ok) {
        socket.close(1008, result.reason);
        return;
      }

      socket.send(JSON.stringify(createEnvelope("pairing.connected", { client: result.client })));
    });
  });

  legacyWebsocketServer.on("close", () => {
    upstreamWebsocketServer?.close();
  });

  return legacyWebsocketServer;
}

export function broadcast(event: BridgeEvent): void {
  const message = JSON.stringify(event);
  for (const client of legacyWebsocketServer?.clients ?? []) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  }

  const upstreamMessage = toUpstreamEnvelope(event);
  if (!upstreamMessage) {
    return;
  }

  for (const client of upstreamWebsocketServer?.clients ?? []) {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(upstreamMessage));
    }
  }
}

async function validateUpstreamConnection(url: string): Promise<
  | { ok: true; client: UpstreamClientRole }
  | { ok: false; reason: string }
> {
  const parsed = new URL(url, "ws://localhost");
  const pairCode = parsed.searchParams.get("pairCode");
  if (!pairCode) {
    return { ok: false, reason: "Invalid pair code" };
  }

  const client = parseUpstreamClientRole(parsed.searchParams.get("client"));
  if (!client) {
    return { ok: false, reason: "Invalid client" };
  }

  const metadata = await readMetadata();
  const session = metadata.pairingSessions.find((candidate) => candidate.token === pairCode);
  if (!session || Date.parse(session.expiresAt) < Date.now()) {
    return { ok: false, reason: "Invalid pair code" };
  }

  return { ok: true, client };
}

function parseUpstreamClientRole(value: string | null): UpstreamClientRole | undefined {
  return value === "mac" || value === "mobile" ? value : undefined;
}

function toUpstreamEnvelope(event: BridgeEvent) {
  if (event.type === "item.created" || event.type === "item.updated") {
    return createEnvelope(event.type, { item: toUpstreamItem(event.item) });
  }

  if (event.type === "item.deleted") {
    return createEnvelope(event.type, { item: { id: event.item.id } });
  }

  if (event.type === "knowledge.saved") {
    return createEnvelope(event.type, { item: toUpstreamItem(event.item) });
  }

  if (event.type === "share.queued" || event.type === "share.sent") {
    return createEnvelope("item.shared", { share: event.share });
  }

  if (event.type === "trust.changed") {
    return createEnvelope("ble.status", {
      status: event.trusted ? "trusted" : "away",
      reason: event.reason
    });
  }

  if (event.type === "pairing.confirmed") {
    return createEnvelope("pairing.connected", { session: event.session });
  }

  return undefined;
}

function createEnvelope(type: string, data: unknown) {
  return {
    type,
    version: 1,
    eventId: `evt_${Date.now()}_${nanoid(8).toLowerCase()}`,
    sentAt: new Date().toISOString(),
    data
  };
}

function toUpstreamItem(item: PocketItem) {
  return {
    id: item.id,
    kind: toUpstreamKind(item),
    title: item.title,
    origin: toUpstreamOrigin(item.source),
    sourceDevice: item.sourceDevice ?? defaultSourceDevice(item.source),
    mimeType: item.mimeType,
    sizeBytes: item.size,
    originalFilename: item.originalName,
    storageRelPath: toStorageRelPath(item.filePath),
    text: item.text,
    tags: item.tags ?? [],
    sharedToMobile: item.sharedToMobile ?? false,
    status: item.status === "exported" ? "saved_to_knowledge" : "inbox",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt ?? item.createdAt,
    archivedAt: item.archivedAt,
    downloadUrl: item.filePath ? `/api/items/${item.id}/download` : undefined,
    knowledgePath: item.knowledgeTarget
  };
}

function toStorageRelPath(filePath: string | undefined): string | undefined {
  if (!filePath) {
    return undefined;
  }

  const relativePath = path.relative(config.dataDir, path.resolve(filePath));
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return undefined;
  }
  return relativePath.split(path.sep).join("/");
}

function toUpstreamOrigin(source: PocketItemSource): "mobile" | "mac" | "snapzy" {
  if (source === "snapzy") {
    return "snapzy";
  }
  if (source === "mac" || source === "system") {
    return "mac";
  }
  return "mobile";
}

function toUpstreamKind(item: PocketItem): "text" | "image" | "file" | "screenshot" {
  if (item.kind === "text") {
    return "text";
  }
  if (item.kind === "image") {
    return item.source === "snapzy" ? "screenshot" : "image";
  }
  return "file";
}

function defaultSourceDevice(source: PocketItemSource): string {
  if (source === "phone") {
    return "PocketBridge Mobile";
  }
  if (source === "snapzy") {
    return "Snapzy";
  }
  return "PocketBridge Mac";
}
