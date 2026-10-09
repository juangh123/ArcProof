import { NextResponse } from "next/server";
import { isHash } from "viem";
import { serializeOrder } from "@/lib/api/serialize";
import { getArcRuntimeConfig } from "@/lib/arc/config";
import { verifyArcPayment } from "@/lib/arc/verifier";
import {
  OrderConflictError,
  TransactionReuseError,
  claimOrderForVerification,
  getOrderById,
  getOrderEvents,
  releaseVerificationClaim,
  recordPaymentRejection,
  recordVerifiedPayment,
} from "@/lib/server/repository";
import { logEvent } from "@/lib/server/logger";
import { getClientKey, orderVerifyLimiter } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const rateLimit = orderVerifyLimiter.check(getClientKey(request));

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many verification requests. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const config = getArcRuntimeConfig();

  if (config.configErrors.length > 0) {
    logEvent("config.invalid", { errors: config.configErrors });
    return NextResponse.json(
      {
        error:
          "The service is not configured for payments right now. Try again later.",
      },
      { status: 503 },
    );
  }

  const order = getOrderById(id);

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Verification compares the receipt against the live deployment config, so
  // refuse orders that were created for a different Arc network instead of
  // checking them against the wrong chain.
  if (order.network !== config.network || order.chainId !== config.chainId) {
    return NextResponse.json(
      {
        error:
          "This payment request was created for a different Arc network. Create a new order before paying.",
      },
      { status: 409 },
    );
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

  if (order.txHash) {
    if (order.txHash.toLowerCase() !== txHash.toLowerCase()) {
      return NextResponse.json(
        { error: "This order already has a different payment transaction." },
        { status: 409 },
      );
    }

    // A verified payment is already bound to this order. Return it as-is
    // instead of downgrading a failed or completed order back to verifying.
    return NextResponse.json({
      order: serializeOrder(order, getOrderEvents(order.id)),
    });
  }

  if (!claimOrderForVerification(order.id)) {
    const current = getOrderById(order.id);

    if (!current) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (
      current.txHash &&
      current.txHash.toLowerCase() === txHash.toLowerCase()
    ) {
      // A concurrent request already verified this payment. Return the
      // recorded state instead of downgrading or re-verifying the order.
      return NextResponse.json({
        order: serializeOrder(current, getOrderEvents(order.id)),
      });
    }

    return NextResponse.json(
      {
        error: current.txHash
          ? "This order already has a different payment transaction."
          : "The order is no longer accepting a payment verification.",
        order: serializeOrder(current, getOrderEvents(order.id)),
      },
      { status: 409 },
    );
  }

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

    logEvent("payment.verification.failed", {
      publicId: order.publicId,
      txHash,
      reason: message,
    });
    releaseVerificationClaim(
      order.id,
      "Arc verification failed. Try again shortly.",
    );
    return NextResponse.json(
      { error: "Arc verification failed. Try again shortly." },
      { status: 503 },
    );
  }
}
