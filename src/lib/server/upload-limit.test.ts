import { describe, expect, it } from "vitest";
import {
  MAX_FILE_SIZE,
  MAX_MULTIPART_OVERHEAD,
  isUploadTooLarge,
  readFormDataWithinLimit,
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

describe("readFormDataWithinLimit", () => {
  it("parses a multipart upload inside the limit", async () => {
    const boundary = "----arcproof-test-boundary";
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="sample"',
      "",
      "true",
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    const upload = await readFormDataWithinLimit(request);

    expect(upload.status).toBe("ok");

    if (upload.status === "ok") {
      expect(upload.formData.get("sample")).toBe("true");
    }
  });

  it("stops reading a chunked request once it exceeds the limit", async () => {
    const chunk = new Uint8Array(1024);
    let pulls = 0;
    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=arcproof",
      },
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls += 1;

          if (pulls > 64) {
            controller.close();
            return;
          }

          controller.enqueue(chunk);
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const upload = await readFormDataWithinLimit(request, 4 * 1024);

    expect(upload.status).toBe("too-large");
    // The reader must be cancelled early instead of buffering all 64 KB.
    expect(pulls).toBeLessThan(64);
  });

  it("rejects a body that is not a multipart form", async () => {
    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sample: true }),
    });

    await expect(readFormDataWithinLimit(request)).rejects.toThrow(
      "multipart",
    );
  });
});
