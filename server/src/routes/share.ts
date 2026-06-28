import { Router } from "express";
import { nanoid } from "nanoid";
import { addShare, readMetadata, updateShare } from "../storage/metadataStore.js";
import type { ShareRequest } from "../types.js";
import { broadcast } from "../websocket/hub.js";

export const shareRouter = Router();

shareRouter.get("/", async (_request, response, next) => {
  try {
    const metadata = await readMetadata();
    const shares = metadata.shares.map((share) => {
      const item = metadata.items.find((candidate) => candidate.id === share.itemId) ?? null;
      return {
        ...share,
        item,
        downloadPath: item?.filePath ? `/items/${share.itemId}/download` : null
      };
    });
    response.json({ shares });
  } catch (error) {
    next(error);
  }
});

shareRouter.post("/", async (request, response, next) => {
  try {
    const { itemId } = request.body as { itemId?: string };
    if (!itemId) {
      response.status(400).json({ error: "itemId is required" });
      return;
    }

    const metadata = await readMetadata();
    const item = metadata.items.find((candidate) => candidate.id === itemId);
    if (!item) {
      response.status(404).json({ error: "item not found" });
      return;
    }

    const share: ShareRequest = {
      id: nanoid(),
      itemId,
      target: "phone",
      status: "queued",
      createdAt: new Date().toISOString()
    };

    await addShare(share);
    broadcast({ type: "share.queued", share });
    response.status(201).json({ share });
  } catch (error) {
    next(error);
  }
});

shareRouter.post("/:shareId/sent", async (request, response, next) => {
  try {
    const metadata = await readMetadata();
    const share = metadata.shares.find((candidate) => candidate.id === request.params.shareId);
    if (!share) {
      response.status(404).json({ error: "share not found" });
      return;
    }

    const sentShare: ShareRequest = {
      ...share,
      status: "sent"
    };
    await updateShare(sentShare);
    broadcast({ type: "share.sent", share: sentShare });
    response.json({ share: sentShare });
  } catch (error) {
    next(error);
  }
});
