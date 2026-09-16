import { describe, expect, it } from "vitest";
import { validateQuote } from "@/lib/domain/quote";

describe("validateQuote", () => {
  it("flags a line total mismatch", () => {
    const quote = validateQuote({
      supplier: "Example",
      quoteNumber: "Q-1",
      issuedDate: "2026-09-17",
      currency: "USD",
      lineItems: [
        {
          lineNumber: 1,
          sku: "SKU-1",
          description: "Part",
          quantity: 3,
          unit: "piece",
          unitPrice: 10,
          lineTotal: 31,
        },
      ],
      subtotal: 31,
      tax: 0,
      total: 31,
      confidence: 0.9,
      validationIssues: [],
      extractionMode: "heuristic",
    });

    expect(
      quote.validationIssues.some(
        (issue) => issue.code === "LINE_TOTAL_MISMATCH",
      ),
    ).toBe(true);
  });
});

