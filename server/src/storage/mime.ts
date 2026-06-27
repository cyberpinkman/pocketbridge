const MIME_BY_EXT: Record<string, string> = {
  ".csv": "text/csv",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".wav": "audio/wav",
  ".webp": "image/webp"
};

const GENERIC_MIME_TYPES = new Set(["application/octet-stream", "binary/octet-stream"]);

export function mimeTypeFromFilename(filename?: string): string | undefined {
  if (!filename) return undefined;
  const match = /\.[^.\\/]+$/.exec(filename.toLowerCase());
  return match ? MIME_BY_EXT[match[0]] : undefined;
}

export function detectMimeType(filename?: string, suppliedMimeType?: string): string | undefined {
  const normalized = normalizeMimeType(suppliedMimeType);
  if (normalized && !GENERIC_MIME_TYPES.has(normalized)) {
    return normalized;
  }

  return mimeTypeFromFilename(filename) ?? normalized;
}

function normalizeMimeType(value?: string): string | undefined {
  const mimeType = value?.split(";")[0]?.trim().toLowerCase();
  return mimeType || undefined;
}
