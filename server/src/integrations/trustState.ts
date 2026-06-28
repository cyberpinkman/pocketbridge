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
  lastSignalAt?: string;
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
  applyBleSignalTimeouts();
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
  const status = setBleStatus(statusFromRssi(rssi), deviceName, rssi);
  currentBleStatus = {
    ...status,
    lastSignalAt: status.updatedAt
  };
  return currentBleStatus;
}

function applyBleSignalTimeouts(): void {
  if (!currentBleStatus.lastSignalAt) {
    return;
  }

  const lastSignalMs = Date.parse(currentBleStatus.lastSignalAt);
  if (Number.isNaN(lastSignalMs)) {
    return;
  }

  const ageMs = Date.now() - lastSignalMs;
  const lockMs = envDuration("PB_BLE_LOCK_MS", 20_000);
  const awayMs = Math.min(envDuration("PB_BLE_AWAY_MS", 10_000), lockMs);
  let nextStatus: BleStatusValue | null = null;

  if (ageMs >= lockMs) {
    nextStatus = "locked";
  } else if (ageMs >= awayMs && currentBleStatus.status === "trusted") {
    nextStatus = "away";
  }

  if (!nextStatus) {
    return;
  }

  const updatedAt = new Date().toISOString();
  currentBleStatus = {
    ...currentBleStatus,
    status: nextStatus,
    lockState: lockStateFromStatus(nextStatus),
    updatedAt
  };
  currentTrustState = {
    trusted: false,
    reason: `BLE status: ${nextStatus}`,
    updatedAt
  };
}

function envDuration(name: string, fallbackMs: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
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
