import { validateQuote } from "@/lib/domain/quote";
import type {
  QuoteLineItem,
  QuoteResult,
} from "@/lib/domain/quote";

function parseAmount(value: string) {
  let normalized = value.replace(/[^0-9.,-]/g, "");

  if (!normalized) {
    return 0;
  }

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // Both separators are present, so the later one is the decimal mark.
    normalized =
      lastComma > lastDot
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = normalized.length - lastComma - 1;
    normalized =
      decimals === 3 && normalized.length > 4
        ? normalized.replace(/,/g, "")
        : normalized.replace(",", ".");
  }

  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function readLabel(text: string, labels: string[]) {
  for (const label of labels) {
    const match = text.match(
      new RegExp(`(?:^|\\n)\\s*${label}\\s*[:#-]?\\s*([^\\n|]+)`, "i"),
    );
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

type QuoteColumn =
  | "lineNumber"
  | "sku"
  | "description"
  | "quantity"
  | "unit"
  | "unitPrice"
  | "lineTotal";

function classifyHeaderCell(cell: string): QuoteColumn | null {
  const value = cell.toLowerCase().replace(/[.:]/g, "").trim();

  if (!value) {
    return null;
  }

  if (/^(line|no|sr|s\/n|#|item\s*no|item\s*#)$/.test(value)) {
    return "lineNumber";
  }

  if (/(sku|part|code|ref)/.test(value)) {
    return "sku";
  }

  if (/(description|details|particulars)/.test(value)) {
    return "description";
  }

  if (/(qty|quantity)/.test(value)) {
    return "quantity";
  }

  if (/(unit\s*price|price|rate)/.test(value)) {
    return "unitPrice";
  }

  if (/(line\s*total|extended|amount|total)/.test(value)) {
    return "lineTotal";
  }

  if (/^(unit|uom)/.test(value)) {
    return "unit";
  }

  return null;
}

function splitColumns(line: string): string[] {
  if (line.includes("|")) {
    return line.split("|").map((column) => column.trim());
  }

  if (line.includes("\t")) {
    return line.split("\t").map((column) => column.trim());
  }

  return line.split(/\s{2,}/).map((column) => column.trim());
}

function buildItem(
  columns: string[],
  columnMap: Array<QuoteColumn | null>,
  fallbackLineNumber: number,
): QuoteLineItem | null {
  const values: Partial<Record<QuoteColumn, string>> = {};

  columnMap.forEach((kind, index) => {
    const cell = columns[index];

    if (kind && cell !== undefined && values[kind] === undefined) {
      values[kind] = cell;
    }
  });

  const description = (values.description ?? "").trim();
  const quantity = parseAmount(values.quantity ?? "");

  if (!description || quantity <= 0) {
    return null;
  }

  const unitPrice = parseAmount(values.unitPrice ?? "");
  const lineTotal =
    values.lineTotal !== undefined && values.lineTotal.trim() !== ""
      ? parseAmount(values.lineTotal)
      : quantity * unitPrice;
  const parsedLineNumber = Number.parseInt(values.lineNumber ?? "", 10);

  return {
    lineNumber:
      Number.isFinite(parsedLineNumber) && parsedLineNumber > 0
        ? parsedLineNumber
        : fallbackLineNumber,
    sku: (values.sku ?? "").trim(),
    description,
    quantity,
    unit: (values.unit ?? "").trim(),
    unitPrice,
    lineTotal,
  };
}

function buildPositionalItem(
  columns: string[],
  fallbackLineNumber: number,
): QuoteLineItem | null {
  if (columns.length < 5) {
    return null;
  }

  const possibleLineNumber = Number.parseInt(columns[0], 10);
  const hasLineNumber = Number.isFinite(possibleLineNumber);
  const offset = hasLineNumber ? 1 : 0;
  const description = columns[offset + 1] ?? "";
  const quantity = parseAmount(columns[offset + 2] ?? "");

  if (!description || quantity <= 0) {
    return null;
  }

  const unitPrice = parseAmount(columns[offset + 4] ?? "");

  return {
    lineNumber: hasLineNumber ? possibleLineNumber : fallbackLineNumber,
    sku: columns[offset] ?? "",
    description,
    quantity,
    unit: columns[offset + 3] ?? "",
    unitPrice,
    lineTotal: parseAmount(
      columns[offset + 5] ?? String(quantity * unitPrice),
    ),
  };
}

function parseLineItems(text: string): QuoteLineItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  const items: QuoteLineItem[] = [];
  let headerIndex = -1;
  let columnMap: Array<QuoteColumn | null> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const cells = splitColumns(lines[index]);

    if (cells.length < 3) {
      continue;
    }

    const kinds = cells.map(classifyHeaderCell);
    const recognized = kinds.filter(Boolean).length;
    const hasQuantity = kinds.includes("quantity");
    const hasMoney =
      kinds.includes("unitPrice") || kinds.includes("lineTotal");

    if (recognized >= 3 && hasQuantity && hasMoney) {
      headerIndex = index;
      columnMap = kinds;
      break;
    }
  }

  const candidates = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;

  for (const line of candidates) {
    if (
      /^\s*(sub\s*total|subtotal|tax|vat|total|grand\s*total|balance)\b/i.test(
        line,
      )
    ) {
      continue;
    }

    const columns = splitColumns(line);
    const item =
      headerIndex >= 0
        ? buildItem(columns, columnMap, items.length + 1)
        : buildPositionalItem(columns, items.length + 1);

    if (item) {
      items.push(item);
    }
  }

  return items;
}

export function extractQuoteHeuristically(text: string): QuoteResult {
  const supplier =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(
        (line) =>
          line.length > 2 &&
          !/quotation|quote|invoice|supplier|date|currency/i.test(line),
      ) ?? "Unknown supplier";
  const lineItems = parseLineItems(text);
  const subtotal = parseAmount(readLabel(text, ["Subtotal"]));
  const tax = parseAmount(readLabel(text, ["Tax", "VAT"]));
  const total = parseAmount(readLabel(text, ["Total"]));
  const confidence = Math.min(
    0.94,
    0.5 +
      (lineItems.length > 0 ? 0.2 : 0) +
      (supplier !== "Unknown supplier" ? 0.1 : 0) +
      (total > 0 ? 0.1 : 0),
  );

  return validateQuote({
    supplier,
    quoteNumber: readLabel(text, ["Quote no", "Quote number", "Quotation"]),
    issuedDate: readLabel(text, ["Issued", "Issue date", "Date"]),
    currency: readLabel(text, ["Currency"]) || "USD",
    lineItems,
    subtotal,
    tax,
    total,
    confidence,
    validationIssues: [],
    extractionMode: "heuristic",
  });
}
