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

  it("extracts a space-aligned quotation with European decimals", () => {
    const text = [
      "ACME INDUSTRIAL SUPPLY",
      "Quotation",
      "Quote no: EU-2026-1",
      "Currency: EUR",
      "",
      "Line    SKU        Description              Qty    Unit     Unit price    Line total",
      "1       BLT-10     Hex bolt, 10 mm          100    piece    0,15          15,00",
      "2       NUT-10     Hex nut, 10 mm            100    piece    0,08          8,00",
      "",
      "Subtotal: 23,00",
      "Tax: 4,37",
      "Total: 27,37",
    ].join("\n");
    const quote = extractQuoteHeuristically(text);

    expect(quote.supplier).toBe("ACME INDUSTRIAL SUPPLY");
    expect(quote.currency).toBe("EUR");
    expect(quote.lineItems).toHaveLength(2);
    expect(quote.lineItems[0].sku).toBe("BLT-10");
    expect(quote.lineItems[0].description).toBe("Hex bolt, 10 mm");
    expect(quote.lineItems[0].quantity).toBe(100);
    expect(quote.lineItems[0].unitPrice).toBeCloseTo(0.15);
    expect(quote.lineItems[0].lineTotal).toBeCloseTo(15);
    expect(quote.subtotal).toBeCloseTo(23);
    expect(quote.tax).toBeCloseTo(4.37);
    expect(quote.total).toBeCloseTo(27.37);
    expect(quote.validationIssues).toHaveLength(0);
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

  it("accepts a Markdown quotation", async () => {
    const file = new File([SAMPLE_QUOTE_TEXT], "quote.md", {
      type: "text/markdown",
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

  it("rejects a text file with a disallowed content type", async () => {
    const file = new File([SAMPLE_QUOTE_TEXT], "quote.txt", {
      type: "text/html",
    });

    await expect(extractTextFromFile(file)).rejects.toThrow(
      "Only PDF, TXT, and Markdown",
    );
  });
});
