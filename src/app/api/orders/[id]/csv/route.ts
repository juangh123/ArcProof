import { getOrderById } from "@/lib/server/repository";

export const runtime = "nodejs";

function csvCell(value: string | number) {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const order = getOrderById(id);

  if (!order?.quoteResult) {
    return Response.json(
      { error: "The processed quotation was not found." },
      { status: 404 },
    );
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
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${order.publicId}.csv"`,
      "cache-control": "no-store",
    },
  });
}

