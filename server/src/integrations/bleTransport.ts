import type { PocketItem, ShareRequest } from "../types.js";

export interface BleTransferEnvelope {
  id: string;
  itemId: string;
  channel: "ble";
  status: "queued" | "sent" | "failed";
  chunkSizeBytes: number;
  createdAt: string;
}

export type QueueBleTransferResult =
  | { ok: true; transfer: BleTransferEnvelope }
  | { ok: false; status: number; error: { code: string; message: string } };

export async function queueBleTransfer(item: PocketItem, share: ShareRequest): Promise<QueueBleTransferResult> {
  if ((process.env.PB_BLE_TRANSPORT ?? "demo") !== "agent") {
    return {
      ok: true,
      transfer: {
        id: share.id,
        itemId: item.id,
        channel: "ble",
        status: "queued",
        chunkSizeBytes: 512,
        createdAt: share.createdAt
      }
    };
  }

  const agentUrl = process.env.PB_BLE_AGENT_URL ?? "http://127.0.0.1:41237";
  const endpoint = new URL("/transfers", agentUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        item: toAgentItem(item),
        share
      })
    });

    if (!response.ok) {
      return bleAgentUnavailable(`BLE agent rejected transfer with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as Partial<BleTransferEnvelope>;
    return {
      ok: true,
      transfer: {
        id: String(payload.id ?? share.id),
        itemId: String(payload.itemId ?? item.id),
        channel: "ble",
        status: isTransferStatus(payload.status) ? payload.status : "queued",
        chunkSizeBytes: typeof payload.chunkSizeBytes === "number" ? payload.chunkSizeBytes : 512,
        createdAt: typeof payload.createdAt === "string" ? payload.createdAt : share.createdAt
      }
    };
  } catch {
    return bleAgentUnavailable(`BLE agent is unavailable at ${agentUrl}`);
  }
}

function toAgentItem(item: PocketItem) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    source: item.source,
    sourceDevice: item.sourceDevice,
    mimeType: item.mimeType,
    size: item.size,
    filePath: item.filePath,
    text: item.text,
    createdAt: item.createdAt
  };
}

function bleAgentUnavailable(message: string): QueueBleTransferResult {
  return {
    ok: false,
    status: 502,
    error: {
      code: "BLE_AGENT_UNAVAILABLE",
      message
    }
  };
}

function isTransferStatus(value: unknown): value is BleTransferEnvelope["status"] {
  return value === "queued" || value === "sent" || value === "failed";
}
