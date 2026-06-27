import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function asyncHandler<T extends RequestHandler>(handler: T): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function notFound(message = "Not found"): never {
  throw new HttpError(404, "NOT_FOUND", message);
}

export function badRequest(message: string): never {
  throw new HttpError(400, "BAD_REQUEST", message);
}

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (typeof err === "object" && err && "code" in err && err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: { code: "UPLOAD_TOO_LARGE", message: "Upload exceeds configured limit" } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}

