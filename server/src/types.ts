export type PocketItemKind = "text" | "image" | "file" | "screenshot";
export type PocketItemOrigin = "mobile" | "mac" | "snapzy";
export type PocketItemStatus = "inbox" | "saved_to_knowledge";
export type BleTrustStatus = "trusted" | "away" | "locked" | "unknown";

export type PocketItem = {
  id: string;
  kind: PocketItemKind;
  title: string;
  origin: PocketItemOrigin;
  sourceDevice: string;
  mimeType?: string;
  sizeBytes?: number;
  originalFilename?: string;
  storageRelPath?: string;
  text?: string;
  tags: string[];
  sharedToMobile: boolean;
  status: PocketItemStatus;
  createdAt: string;
  updatedAt: string;
  downloadUrl?: string;
  knowledgePath?: string;
};

export type PairingPayload = {
  protocol: "pocketbridge";
  version: 1;
  serverBaseUrl: string;
  wsUrl: string;
  pairCode: string;
  deviceName: string;
  expiresAt: string;
  capabilities: string[];
};

export type PocketEventType =
  | "pairing.connected"
  | "item.created"
  | "item.updated"
  | "item.shared"
  | "knowledge.saved"
  | "ble.status";

export type PocketEvent = {
  type: PocketEventType;
  version: 1;
  eventId: string;
  sentAt: string;
  data: unknown;
};

export type BleStatus = {
  status: BleTrustStatus;
  deviceName: string;
  rssi?: number;
  updatedAt: string;
};

export type ItemFilters = {
  origin?: PocketItemOrigin;
  sharedToMobile?: boolean;
  limit?: number;
};

export function isPocketItemOrigin(value: unknown): value is PocketItemOrigin {
  return value === "mobile" || value === "mac" || value === "snapzy";
}

export function isBleTrustStatus(value: unknown): value is BleTrustStatus {
  return value === "trusted" || value === "away" || value === "locked" || value === "unknown";
}

