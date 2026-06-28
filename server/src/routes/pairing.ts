import { Router } from "express";
import type { Request } from "express";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import { config } from "../config.js";
import { addPairingSession, readMetadata, updatePairingSession } from "../storage/metadataStore.js";
import type { PairingSession } from "../types.js";
import { broadcast } from "../websocket/hub.js";

export const pairingRouter = Router();

pairingRouter.post("/session", async (request, response, next) => {
  try {
    const now = new Date();
    const session: PairingSession = {
      id: nanoid(),
      token: nanoid(32),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString()
    };
    const pairingPayload = {
      protocol: "pocketbridge",
      version: 1,
      token: session.token,
      bridgeUrl: resolveBridgeUrl(request)
    };
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(pairingPayload));

    await addPairingSession(session);
    broadcast({ type: "pairing.created", session, qrDataUrl });
    response.status(201).json({ session, pairingPayload, qrDataUrl });
  } catch (error) {
    next(error);
  }
});

function resolveBridgeUrl(request: Request): string {
  const requestedBridgeUrl = (request.body as { bridgeUrl?: unknown } | undefined)?.bridgeUrl;
  if (typeof requestedBridgeUrl === "string" && isHttpUrl(requestedBridgeUrl)) {
    return requestedBridgeUrl.replace(/\/$/, "");
  }

  if (process.env.POCKETBRIDGE_PUBLIC_URL && isHttpUrl(process.env.POCKETBRIDGE_PUBLIC_URL)) {
    return process.env.POCKETBRIDGE_PUBLIC_URL.replace(/\/$/, "");
  }

  return `${request.protocol}://${request.get("host") ?? `localhost:${config.port}`}`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

pairingRouter.post("/confirm", async (request, response, next) => {
  try {
    const { token, deviceName } = request.body as { token?: string; deviceName?: string };
    if (!token) {
      response.status(400).json({ error: "token is required" });
      return;
    }

    const metadata = await readMetadata();
    const session = metadata.pairingSessions.find((candidate) => candidate.token === token);
    if (!session) {
      response.status(404).json({ error: "pairing session not found" });
      return;
    }

    if (Date.parse(session.expiresAt) < Date.now()) {
      response.status(410).json({ error: "pairing session expired" });
      return;
    }

    const confirmedSession: PairingSession = {
      ...session,
      deviceName,
      confirmedAt: new Date().toISOString()
    };
    await updatePairingSession(confirmedSession);
    broadcast({ type: "pairing.confirmed", session: confirmedSession });
    response.json({ session: confirmedSession });
  } catch (error) {
    next(error);
  }
});
