import type { OrderRecord } from "@/lib/domain/order";

export function csvCell(value: string | number) {
  let text = String(value);

  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

export function buildOrderCsv(order: OrderRecord) {
  if (!order.quoteResult) {
    return null;
  }

  const rows = [
    [
      "line_number",
      "sku",
      "description",
      "quantity",
      "unit",
      "unit_price",
      "line_total",
      "currency",
    ],
    ...order.quoteResult.lineItems.map((item) => [
      item.lineNumber,
      item.sku,
      item.description,
      item.quantity,
      item.unit,
      item.unitPrice,
      item.lineTotal,
      order.quoteResult?.currency ?? "USD",
    ]),
  ];

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function csvResponse(order: OrderRecord) {
  const csv = buildOrderCsv(order);

  if (!csv) {
    return null;
  }

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${order.publicId}.csv"`,
      "cache-control": "no-store",
    },
  });
}
