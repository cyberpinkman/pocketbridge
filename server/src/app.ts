import path from "node:path";
import cors from "cors";
import express from "express";
import multer from "multer";
import { getTrustState, setTrustState } from "./integrations/trustState.js";
import { apiRouter } from "./routes/api.js";
import { exportRouter } from "./routes/export.js";
import { itemsRouter } from "./routes/items.js";
import { pairingRouter } from "./routes/pairing.js";
import { shareRouter } from "./routes/share.js";
import { snapzyRouter } from "./routes/snapzy.js";
import { uploadRouter } from "./routes/upload.js";
import { broadcast } from "./websocket/hub.js";

export function createApp(): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.static(path.resolve(process.cwd(), "apps", "mac_desktop", "web")));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "pocketbridge",
      version: 1,
      name: "PocketBridge",
      trust: getTrustState()
    });
  });

  app.post("/trust/simulate", (request, response) => {
    const { trusted, reason } = request.body as { trusted?: boolean; reason?: string };
    const nextState = setTrustState(Boolean(trusted), reason ?? "Manual demo toggle");
    broadcast({ type: "trust.changed", trusted: nextState.trusted, reason: nextState.reason });
    response.json({ trust: nextState });
  });

  app.use("/api", apiRouter);
  app.use("/items", itemsRouter);
  app.use("/export", exportRouter);
  app.use("/pairing", pairingRouter);
  app.use("/share", shareRouter);
  app.use("/snapzy", snapzyRouter);
  app.use("/upload", uploadRouter);

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction
    ) => {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        response.status(413).json({
          error: {
            code: "UPLOAD_TOO_LARGE",
            message: "Upload exceeds the configured maximum file size"
          }
        });
        return;
      }

      console.error(error);
      if (_request.path.startsWith("/api")) {
        response.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: "Internal server error"
          }
        });
        return;
      }

      response.status(500).json({ error: "internal server error" });
    }
  );

  return app;
}
