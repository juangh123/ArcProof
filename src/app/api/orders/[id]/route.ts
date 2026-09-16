import { NextResponse } from "next/server";
import { serializeOrder } from "@/lib/api/serialize";
import {
  getOrderById,
  getOrderEvents,
} from "@/lib/server/repository";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const order = getOrderById(id);

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  return NextResponse.json({
    order: serializeOrder(order, getOrderEvents(order.id)),
  });
}

