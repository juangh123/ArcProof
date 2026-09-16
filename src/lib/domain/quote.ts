import { z } from "zod";

export const quoteLineItemSchema = z.object({
  lineNumber: z.number().int().nonnegative(),
  sku: z.string().default(""),
  description: z.string().min(1),
  quantity: z.number().nonnegative(),
  unit: z.string().default(""),
  unitPrice: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
});

export const quoteValidationIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["warning", "error"]),
  message: z.string(),
});

export const quoteResultSchema = z.object({
  supplier: z.string().default("Unknown supplier"),
  quoteNumber: z.string().default(""),
  issuedDate: z.string().default(""),
  currency: z.string().default("USD"),
  lineItems: z.array(quoteLineItemSchema).default([]),
  subtotal: z.number().nonnegative().default(0),
  tax: z.number().nonnegative().default(0),
  total: z.number().nonnegative().default(0),
  confidence: z.number().min(0).max(1).default(0),
  validationIssues: z.array(quoteValidationIssueSchema).default([]),
  extractionMode: z.enum(["ai", "heuristic"]).default("heuristic"),
});

export type QuoteLineItem = z.infer<typeof quoteLineItemSchema>;
export type QuoteValidationIssue = z.infer<
  typeof quoteValidationIssueSchema
>;
export type QuoteResult = z.infer<typeof quoteResultSchema>;

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function validateQuote(quote: QuoteResult): QuoteResult {
  const validationIssues: QuoteValidationIssue[] = [...quote.validationIssues];
  const lineItems = quote.lineItems.map((item) => {
    const expected = roundMoney(item.quantity * item.unitPrice);
    const delta = Math.abs(expected - item.lineTotal);

    if (delta > 0.01) {
      validationIssues.push({
        code: "LINE_TOTAL_MISMATCH",
        severity: "warning",
        message: `Line ${item.lineNumber} total is ${item.lineTotal.toFixed(2)}, expected ${expected.toFixed(2)}.`,
      });
    }

    return item;
  });

  const calculatedSubtotal = roundMoney(
    lineItems.reduce((sum, item) => sum + item.lineTotal, 0),
  );
  const calculatedTotal = roundMoney(calculatedSubtotal + quote.tax);

  if (
    quote.subtotal > 0 &&
    Math.abs(calculatedSubtotal - quote.subtotal) > 0.01
  ) {
    validationIssues.push({
      code: "SUBTOTAL_MISMATCH",
      severity: "warning",
      message: `Subtotal is ${quote.subtotal.toFixed(2)}, line items sum to ${calculatedSubtotal.toFixed(2)}.`,
    });
  }

  if (quote.total > 0 && Math.abs(calculatedTotal - quote.total) > 0.01) {
    validationIssues.push({
      code: "TOTAL_MISMATCH",
      severity: "warning",
      message: `Total is ${quote.total.toFixed(2)}, calculated total is ${calculatedTotal.toFixed(2)}.`,
    });
  }

  if (lineItems.length === 0) {
    validationIssues.push({
      code: "NO_LINE_ITEMS",
      severity: "error",
      message: "No structured line items were found.",
    });
  }

  return {
    ...quote,
    lineItems,
    subtotal: quote.subtotal || calculatedSubtotal,
    total: quote.total || calculatedTotal,
    validationIssues,
    confidence: Math.max(
      0,
      Math.min(
        1,
        quote.confidence - validationIssues.filter((issue) => issue.severity === "error").length * 0.15,
      ),
    ),
  };
}

