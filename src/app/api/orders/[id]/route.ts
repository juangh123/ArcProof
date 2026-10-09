import { NextResponse } from "next/server";
import { serializeOrder } from "@/lib/api/serialize";
import {
  getOrderById,
  getOrderEvents,
} from "@/lib/server/repository";
import {
  getClientKey,
  orderReadLimiter,
  tooManyRequests,
} from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rateLimit = orderReadLimiter.check(getClientKey(request));

  if (!rateLimit.allowed) {
    return tooManyRequests(
      rateLimit,
      "Too many order requests. Try again shortly.",
    );
  }

  const { id } = await context.params;
  const order = getOrderById(id);

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  return NextResponse.json({
    order: serializeOrder(order, getOrderEvents(order.id)),
  });
}

