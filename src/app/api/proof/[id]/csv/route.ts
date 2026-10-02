import { getOrderByPublicId } from "@/lib/server/repository";
import { csvResponse } from "@/lib/server/csv";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const order = getOrderByPublicId(id);

  if (!order || order.status !== "completed") {
    return Response.json(
      { error: "The processed quotation was not found." },
      { status: 404 },
    );
  }

  const response = csvResponse(order);

  return (
    response ??
    Response.json(
      { error: "The processed quotation was not found." },
      { status: 404 },
    )
  );
}
