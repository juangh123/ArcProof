import { describe, expect, it } from "vitest";
import {
  extractQuoteHeuristically,
  extractTextFromFile,
} from "@/lib/server/extract";
import { SAMPLE_QUOTE_TEXT } from "@/lib/server/sample";

describe("extractQuoteHeuristically", () => {
  it("extracts the sample quotation without an external AI key", () => {
    const quote = extractQuoteHeuristically(SAMPLE_QUOTE_TEXT);

    expect(quote.supplier).toBe("NORTHSTAR INDUSTRIAL SUPPLY");
    expect(quote.quoteNumber).toBe("NS-2026-1048");
    expect(quote.currency).toBe("USD");
    expect(quote.lineItems).toHaveLength(3);
    expect(quote.subtotal).toBe(1541);
    expect(quote.tax).toBe(92.46);
    expect(quote.total).toBe(1633.46);
    expect(quote.validationIssues).toHaveLength(0);
    expect(quote.extractionMode).toBe("heuristic");
  });
});

describe("extractTextFromFile", () => {
  it("accepts a text quotation", async () => {
    const file = new File([SAMPLE_QUOTE_TEXT], "quote.txt", {
      type: "text/plain",
    });

    await expect(extractTextFromFile(file)).resolves.toContain(
      "NORTHSTAR INDUSTRIAL SUPPLY",
    );
  });

  it("rejects a file with a PDF extension but no PDF signature", async () => {
    const file = new File(["not a pdf"], "quote.pdf", {
      type: "application/pdf",
    });

    await expect(extractTextFromFile(file)).rejects.toThrow(
      "not a valid PDF",
    );
  });

  it("rejects binary data disguised as text", async () => {
    const file = new File(
      [new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])],
      "quote.txt",
      { type: "text/plain" },
    );

    await expect(extractTextFromFile(file)).rejects.toThrow(
      "contains binary data",
    );
  });
});
