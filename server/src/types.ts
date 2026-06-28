export type PocketItemKind = "image" | "document" | "text" | "link";
export type PocketItemSource = "phone" | "mac" | "snapzy" | "system";
export type PocketItemStatus = "inbox" | "exported" | "archived";

export interface PocketItem {
  id: string;
  kind: PocketItemKind;
  source: PocketItemSource;
  title: string;
  createdAt: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  filePath?: string;
  text?: string;
  status: PocketItemStatus;
  knowledgeTarget?: string;
  sourceDevice?: string;
  tags?: string[];
  sharedToMobile?: boolean;
  updatedAt?: string;
}

export interface PairingSession {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  confirmedAt?: string;
  deviceName?: string;
}

export interface ShareRequest {
  id: string;
  itemId: string;
  createdAt: string;
  target: "phone";
  status: "queued" | "sent" | "cancelled";
}

export interface PocketMetadata {
  items: PocketItem[];
  pairingSessions: PairingSession[];
  shares: ShareRequest[];
}

export type BridgeEvent =
  | { type: "item.created"; item: PocketItem }
  | { type: "item.updated"; item: PocketItem }
  | { type: "pairing.created"; session: PairingSession; qrDataUrl: string }
  | { type: "pairing.confirmed"; session: PairingSession }
  | { type: "share.queued"; share: ShareRequest }
  | { type: "share.sent"; share: ShareRequest }
  | { type: "trust.changed"; trusted: boolean; reason: string };
