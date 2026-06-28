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
  lockState?: "unlocked" | "away" | "locked";
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
    lockState: lockStateFromStatus(status),
    updatedAt
  };
  currentTrustState = {
    trusted: status === "trusted",
    reason: `BLE status: ${status}`,
    updatedAt
  };
  return currentBleStatus;
}

export function setBleRssi(deviceName: string, rssi: number): BleStatus {
  return setBleStatus(statusFromRssi(rssi), deviceName, rssi);
}

function statusFromRssi(rssi: number): BleStatusValue {
  if (rssi >= -65) {
    return "trusted";
  }
  if (rssi <= -85) {
    return "locked";
  }
  return "away";
}

function lockStateFromStatus(status: BleStatusValue): "unlocked" | "away" | "locked" {
  if (status === "trusted") {
    return "unlocked";
  }
  if (status === "locked") {
    return "locked";
  }
  return "away";
}
