import { extractText } from "unpdf";
import OpenAI from "openai";
import { quoteResultSchema, validateQuote } from "@/lib/domain/quote";
import type {
  QuoteLineItem,
  QuoteResult,
  QuoteValidationIssue,
} from "@/lib/domain/quote";

const MAX_EXTRACTED_CHARACTERS = 200_000;

function hasPdfSignature(bytes: Uint8Array) {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function looksLikeText(bytes: Uint8Array) {
  if (bytes.length === 0) {
    return false;
  }

  let controlCharacters = 0;

  for (const byte of bytes) {
    if (
      byte === 0 ||
      (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)
    ) {
      controlCharacters += 1;
    }
  }

  return controlCharacters / bytes.length < 0.02;
}

function parseAmount(value: string) {
  const normalized = value.replace(/[^0-9.-]/g, "");
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

function parseLineItems(text: string): QuoteLineItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items: QuoteLineItem[] = [];
  let headerIndex = -1;

  lines.forEach((line, index) => {
    if (
      /\b(line|no\.?|item)\b/i.test(line) &&
      /\b(qty|quantity)\b/i.test(line) &&
      /\b(price|rate)\b/i.test(line)
    ) {
      headerIndex = index;
    }
  });

  const candidates =
    headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;

  for (const line of candidates) {
    const columns = line
      .split(/\s*\|\s*|\t+/)
      .map((column) => column.trim())
      .filter(Boolean);

    if (columns.length < 5) {
      continue;
    }

    const possibleLineNumber = Number.parseInt(columns[0], 10);
    const lineNumber = Number.isFinite(possibleLineNumber)
      ? possibleLineNumber
      : items.length + 1;
    const offset = Number.isFinite(possibleLineNumber) ? 1 : 0;
    const sku = columns[offset] ?? "";
    const description = columns[offset + 1] ?? "";
    const quantity = parseAmount(columns[offset + 2] ?? "");
    const unit = columns[offset + 3] ?? "";
    const unitPrice = parseAmount(columns[offset + 4] ?? "");
    const lineTotal = parseAmount(
      columns[offset + 5] ?? String(quantity * unitPrice),
    );

    if (!description || quantity <= 0) {
      continue;
    }

    items.push({
      lineNumber,
      sku,
      description,
      quantity,
      unit,
      unitPrice,
      lineTotal,
    });
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
  const issues: QuoteValidationIssue[] = [];

  if (lineItems.length === 0) {
    issues.push({
      code: "NO_LINE_ITEMS",
      severity: "error",
      message: "The document did not contain a readable line-item table.",
    });
  }

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
    validationIssues: issues,
    extractionMode: "heuristic",
  });
}

async function extractQuoteWithAi(text: string): Promise<QuoteResult> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";
  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Extract supplier quotation data. Return JSON only. Never invent missing values. Monetary values must be numbers, not strings.",
      },
      {
        role: "user",
        content: `Return this exact object shape:
{
  "supplier": "string",
  "quoteNumber": "string",
  "issuedDate": "YYYY-MM-DD or empty string",
  "currency": "ISO 4217",
  "lineItems": [{
    "lineNumber": 1,
    "sku": "string",
    "description": "string",
    "quantity": 1,
    "unit": "string",
    "unitPrice": 0,
    "lineTotal": 0
  }],
  "subtotal": 0,
  "tax": 0,
  "total": 0,
  "confidence": 0.9,
  "validationIssues": []
}

Quotation text:
${text}`,
      },
    ],
  });
  const content = completion.choices[0]?.message.content;

  if (!content) {
    throw new Error("The AI provider returned an empty response.");
  }

  const parsed = quoteResultSchema.parse(JSON.parse(content));
  return validateQuote({
    ...parsed,
    extractionMode: "ai",
  });
}

export async function extractQuoteFromText(text: string) {
  if (!process.env.OPENAI_API_KEY) {
    return extractQuoteHeuristically(text);
  }

  try {
    return await extractQuoteWithAi(text);
  } catch (error) {
    const fallback = extractQuoteHeuristically(text);
    return {
      ...fallback,
      validationIssues: [
        ...fallback.validationIssues,
        {
          code: "AI_FALLBACK",
          severity: "warning" as const,
          message:
            error instanceof Error
              ? `AI extraction failed and the deterministic parser was used: ${error.message}`
              : "AI extraction failed and the deterministic parser was used.",
        },
      ],
    };
  }
}

export async function extractTextFromFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();
  const isPdf =
    file.type === "application/pdf" || lowerName.endsWith(".pdf");
  const hasTextExtension =
    lowerName.endsWith(".txt") || lowerName.endsWith(".md");
  const hasTextCompatibleType = new Set([
    "",
    "application/octet-stream",
    "text/plain",
    "text/markdown",
    "text/x-markdown",
  ]).has(file.type);
  const isText =
    hasTextExtension && hasTextCompatibleType;
  let text = "";

  if (isPdf) {
    if (!hasPdfSignature(bytes)) {
      throw new Error("The uploaded file is not a valid PDF document.");
    }

    const result = await extractText(bytes, { mergePages: true });
    text = result.text;
  } else if (isText) {
    if (!looksLikeText(bytes)) {
      throw new Error("The uploaded text file contains binary data.");
    }

    text = new TextDecoder().decode(bytes);
  } else {
    throw new Error("Only PDF, TXT, and Markdown documents are supported.");
  }

  const normalized = text.replace(/\u0000/g, "").trim();

  if (!normalized) {
    throw new Error("No readable text was found in the document.");
  }

  if (normalized.length > MAX_EXTRACTED_CHARACTERS) {
    throw new Error("The extracted document is too large.");
  }

  return normalized;
}
