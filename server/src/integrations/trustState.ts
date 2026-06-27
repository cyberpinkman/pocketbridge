export interface TrustState {
  trusted: boolean;
  reason: string;
  updatedAt: string;
}

export type BleStatusValue = "trusted" | "away" | "locked" | "unknown";

export interface BleStatus {
  status: BleStatusValue;
  deviceName: string;
  rssi?: number;
  updatedAt: string;
}

let currentTrustState: TrustState = {
  trusted: false,
  reason: "No phone proximity signal yet",
  updatedAt: new Date().toISOString()
};

let currentBleStatus: BleStatus = {
  status: "unknown",
  deviceName: "PocketBridge Mobile",
  updatedAt: currentTrustState.updatedAt
};

export function getTrustState(): TrustState {
  return currentTrustState;
}

export function setTrustState(trusted: boolean, reason: string): TrustState {
  currentTrustState = {
    trusted,
    reason,
    updatedAt: new Date().toISOString()
  };
  return currentTrustState;
}

export function getBleStatus(): BleStatus {
  return currentBleStatus;
}

export function setBleStatus(
  status: BleStatusValue,
  deviceName: string,
  rssi?: number
): BleStatus {
  const updatedAt = new Date().toISOString();
  currentBleStatus = {
    status,
    deviceName,
    rssi,
    updatedAt
  };
  currentTrustState = {
    trusted: status === "trusted",
    reason: `BLE status: ${status}`,
    updatedAt
  };
  return currentBleStatus;
}
