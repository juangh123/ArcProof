import { UserFacingError } from "@/lib/server/errors";

export const MAX_FILE_SIZE = 8 * 1024 * 1024;
export const MAX_MULTIPART_OVERHEAD = 1024 * 1024;
export const MAX_REQUEST_BYTES = MAX_FILE_SIZE + MAX_MULTIPART_OVERHEAD;

export function isUploadTooLarge(
  request: Request,
  maxBytes = MAX_REQUEST_BYTES,
) {
  const contentLength = Number(request.headers.get("content-length"));

  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

async function readBodyWithinLimit(request: Request, maxBytes: number) {
  const body = request.body;

  if (!body) {
    return new Uint8Array(0);
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

// Streams the request body with a hard byte ceiling, so a chunked request
// without a Content-Length header cannot buffer an unbounded payload.
export async function readFormDataWithinLimit(
  request: Request,
  maxBytes = MAX_REQUEST_BYTES,
): Promise<{ status: "ok"; formData: FormData } | { status: "too-large" }> {
  const bytes = await readBodyWithinLimit(request, maxBytes);

  if (!bytes) {
    return { status: "too-large" };
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new UserFacingError(
      "Upload the document as a multipart form request.",
    );
  }

  let formData: FormData;

  try {
    formData = await new Response(bytes, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new UserFacingError(
      "The upload could not be read. Choose the document again.",
    );
  }

  return { status: "ok", formData };
}
