import { NextResponse } from "next/server";
import { isHash } from "viem";
import { serializeOrder } from "@/lib/api/serialize";
import { verifyArcPayment } from "@/lib/arc/verifier";
import {
  OrderConflictError,
  TransactionReuseError,
  getOrderById,
  getOrderEvents,
  releaseVerificationClaim,
  recordPaymentRejection,
  recordVerifiedPayment,
  setOrderStatus,
} from "@/lib/server/repository";
import { logEvent } from "@/lib/server/logger";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const order = getOrderById(id);

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    txHash?: string;
  } | null;
  const txHash = body?.txHash;

  if (!txHash || !isHash(txHash)) {
    return NextResponse.json(
      { error: "A valid Arc transaction hash is required." },
      { status: 400 },
    );
  }

  if (
    order.txHash &&
    order.txHash.toLowerCase() !== txHash.toLowerCase()
  ) {
    return NextResponse.json(
      { error: "This order already has a different payment transaction." },
      { status: 409 },
    );
  }

  if (
    order.txHash &&
    (order.status === "payment_verified" ||
      order.status === "processing" ||
      order.status === "completed")
  ) {
    return NextResponse.json({
      order: serializeOrder(order, getOrderEvents(order.id)),
    });
  }

  setOrderStatus(order.id, "verifying");
  logEvent("payment.verification.started", {
    publicId: order.publicId,
    txHash,
  });

  try {
    const result = await verifyArcPayment({
      txHash,
      expectedMemoId: order.paymentMemoId,
      expectedAmountUsdc: order.amountDisplay,
      expectedRecipient: order.recipientAddress,
    });

    if (result.status === "pending") {
      releaseVerificationClaim(order.id);
      return NextResponse.json(
        {
          status: "pending",
          message: "The transaction is not finalized yet.",
        },
        { status: 202 },
      );
    }

    if (result.status === "rejected") {
      recordPaymentRejection(order.id, result.reason, result.details);
      const rejectedOrder = getOrderById(order.id);
      return NextResponse.json(
        {
          error: result.reason,
          order: rejectedOrder
            ? serializeOrder(rejectedOrder, getOrderEvents(order.id))
            : null,
        },
        { status: 422 },
      );
    }

    const verifiedOrder = recordVerifiedPayment(order.id, result.proof);
    logEvent("payment.verification.completed", {
      publicId: order.publicId,
      txHash,
    });
    return NextResponse.json({
      order: verifiedOrder
        ? serializeOrder(verifiedOrder, getOrderEvents(order.id))
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Arc verification failed.";

    if (
      error instanceof TransactionReuseError ||
      error instanceof OrderConflictError
    ) {
      logEvent("payment.verification.conflict", {
        publicId: order.publicId,
        txHash,
        reason: message,
      });
      const current = getOrderById(order.id);
      return NextResponse.json(
        {
          error: message,
          order: current
            ? serializeOrder(current, getOrderEvents(order.id))
            : null,
        },
        { status: 409 },
      );
    }

    releaseVerificationClaim(order.id, message);
    return NextResponse.json(
      { error: "Arc verification failed. Try again shortly." },
      { status: 503 },
    );
  }
}
