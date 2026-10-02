import { describe, expect, it } from "vitest";
import {
  MAX_FILE_SIZE,
  MAX_MULTIPART_OVERHEAD,
  isUploadTooLarge,
} from "@/lib/server/upload-limit";

describe("isUploadTooLarge", () => {
  it("rejects an oversized declared payload before multipart parsing", () => {
    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "content-length": String(MAX_FILE_SIZE + MAX_MULTIPART_OVERHEAD + 1),
      },
    });

    expect(isUploadTooLarge(request)).toBe(true);
  });

  it("allows a payload inside the file limit plus multipart overhead", () => {
    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "content-length": String(MAX_FILE_SIZE + MAX_MULTIPART_OVERHEAD),
      },
    });

    expect(isUploadTooLarge(request)).toBe(false);
  });
});
