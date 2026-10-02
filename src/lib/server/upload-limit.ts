export const MAX_FILE_SIZE = 8 * 1024 * 1024;
export const MAX_MULTIPART_OVERHEAD = 1024 * 1024;

export function isUploadTooLarge(
  request: Request,
  maxBytes = MAX_FILE_SIZE + MAX_MULTIPART_OVERHEAD,
) {
  const contentLength = Number(request.headers.get("content-length"));

  return Number.isFinite(contentLength) && contentLength > maxBytes;
}
