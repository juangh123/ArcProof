import { randomBytes, randomUUID } from "node:crypto";
import { getAddress, keccak256, parseUnits, stringToHex } from "viem";
import { getDatabase } from "@/lib/server/db";
import {
  orderStatusLabels,
  type OrderEvent,
  type OrderRecord,
  type OrderStatus,
  type PaymentProof,
} from "@/lib/domain/order";
import type { QuoteResult } from "@/lib/domain/quote";

type CreateOrderInput = {
  sourceName: string;
  sourceKind: string;
  sourceText: string;
  amountDisplay: string;
  recipientAddress: `0x${string}`;
  network: "mainnet" | "testnet";
  chainId: number;
  isPublic?: boolean;
};

export class OrderConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderConflictError";
  }
}

export class TransactionReuseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionReuseError";
  }
}

function now() {
  return new Date().toISOString();
}

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function rowToOrder(row: Record<string, unknown>): OrderRecord {
  return {
    id: String(row.id),
    publicId: String(row.public_id),
    status: String(row.status) as OrderStatus,
    sourceName: String(row.source_name),
    sourceKind: String(row.source_kind),
    sourceText: String(row.source_text),
    quoteResult: parseJson<QuoteResult>(row.quote_result),
    extractionMode:
      row.extraction_mode === "ai" || row.extraction_mode === "heuristic"
        ? row.extraction_mode
        : null,
    paymentMemoId: String(row.payment_memo_id) as `0x${string}`,
    amountDisplay: String(row.amount_display),
    amountAtomic18: String(row.amount_atomic18),
    amountAtomic6: String(row.amount_atomic6),
    recipientAddress: getAddress(String(row.recipient_address)),
    network: String(row.network) === "testnet" ? "testnet" : "mainnet",
    chainId: Number(row.chain_id),
    txHash: row.tx_hash ? (String(row.tx_hash) as `0x${string}`) : null,
    payerAddress: row.payer_address
      ? getAddress(String(row.payer_address))
      : null,
    blockNumber: row.block_number ? String(row.block_number) : null,
    blockHash: row.block_hash
      ? (String(row.block_hash) as `0x${string}`)
      : null,
    paymentProof: parseJson<PaymentProof>(row.payment_proof),
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
    processedAt: row.processed_at ? String(row.processed_at) : null,
    processingAttempts: Number(row.processing_attempts ?? 0),
    processingStartedAt: row.processing_started_at
      ? String(row.processing_started_at)
      : null,
    isPublic: Boolean(row.is_public),
  };
}

function findOrderRow(column: "id" | "public_id", value: string) {
  const database = getDatabase();
  return database
    .prepare(`SELECT * FROM orders WHERE ${column} = ? LIMIT 1`)
    .get(value) as Record<string, unknown> | undefined;
}

export function createOrder(input: CreateOrderInput) {
  const database = getDatabase();
  const id = randomUUID();
  const publicId = `AP-${randomBytes(4).toString("hex").toUpperCase()}`;
  const paymentMemoId = keccak256(
    stringToHex(`${id}:${randomBytes(16).toString("hex")}`),
  );
  const timestamp = now();

  database
    .prepare(
      `INSERT INTO orders (
        id, public_id, status, source_name, source_kind, source_text,
        payment_memo_id, amount_display, amount_atomic18, amount_atomic6,
        recipient_address, network, chain_id, created_at, updated_at, is_public
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      publicId,
      "awaiting_payment",
      input.sourceName,
      input.sourceKind,
      input.sourceText,
      paymentMemoId,
      input.amountDisplay,
      parseUnits(input.amountDisplay, 18).toString(),
      parseUnits(input.amountDisplay, 6).toString(),
      input.recipientAddress,
      input.network,
      input.chainId,
      timestamp,
      timestamp,
      input.isPublic ? 1 : 0,
    );

  addOrderEvent(id, "order.created", {
    publicId,
    sourceName: input.sourceName,
  });

  const order = getOrderById(id);

  if (!order) {
    throw new Error("Order creation failed.");
  }

  return order;
}

export function getOrderById(id: string) {
  const row = findOrderRow("id", id);
  return row ? rowToOrder(row) : null;
}

export function getOrderByPublicId(publicId: string) {
  const row = findOrderRow("public_id", publicId);
  return row ? rowToOrder(row) : null;
}

export function listRecentOrders(limit = 12) {
  const database = getDatabase();
  const rows = database
    .prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Array<Record<string, unknown>>;

  return rows.map(rowToOrder);
}

export function addOrderEvent(
  orderId: string,
  type: string,
  payload: Record<string, unknown>,
) {
  getDatabase()
    .prepare(
      "INSERT INTO order_events (order_id, type, payload, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(orderId, type, JSON.stringify(payload), now());
}

export function getOrderEvents(orderId: string): OrderEvent[] {
  const rows = getDatabase()
    .prepare(
      "SELECT id, order_id, type, payload, created_at FROM order_events WHERE order_id = ? ORDER BY id ASC",
    )
    .all(orderId) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: Number(row.id),
    orderId: String(row.order_id),
    type: String(row.type),
    payload: parseJson<Record<string, unknown>>(row.payload) ?? {},
    createdAt: String(row.created_at),
  }));
}

export function setOrderStatus(
  orderId: string,
  status: OrderStatus,
  errorMessage: string | null = null,
) {
  getDatabase()
    .prepare(
      "UPDATE orders SET status = ?, error_message = ?, updated_at = ? WHERE id = ?",
    )
    .run(status, errorMessage, now(), orderId);
}

export function recordVerifiedPayment(
  orderId: string,
  proof: PaymentProof,
) {
  const database = getDatabase();
  const timestamp = now();

  try {
    const result = database
      .prepare(
        `UPDATE orders
         SET status = ?, tx_hash = ?, payer_address = ?, block_number = ?,
             block_hash = ?, payment_proof = ?, error_message = NULL,
             verified_at = ?, updated_at = ?
         WHERE id = ?
           AND tx_hash IS NULL
           AND status IN ('awaiting_payment', 'verifying', 'payment_rejected')`,
      )
      .run(
        "payment_verified",
        proof.txHash,
        proof.payerAddress,
        proof.blockNumber,
        proof.blockHash,
        JSON.stringify(proof),
        timestamp,
        timestamp,
        orderId,
      );

    if (Number(result.changes) === 0) {
      const current = getOrderById(orderId);

      if (!current) {
        throw new OrderConflictError("The order no longer exists.");
      }

      if (
        current.txHash &&
        current.txHash.toLowerCase() === proof.txHash.toLowerCase()
      ) {
        return current;
      }

      if (current.txHash) {
        throw new OrderConflictError(
          "This order already has a different payment transaction.",
        );
      }

      throw new OrderConflictError(
        "The order changed while payment was being verified. Try again.",
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("orders.tx_hash")
    ) {
      throw new TransactionReuseError(
        "This Arc transaction has already been used.",
      );
    }
    throw error;
  }

  addOrderEvent(orderId, "payment.verified", {
    txHash: proof.txHash,
    blockNumber: proof.blockNumber,
    payerAddress: proof.payerAddress,
  });

  return getOrderById(orderId);
}

export function recordPaymentRejection(
  orderId: string,
  reason: string,
  details: Record<string, unknown> = {},
) {
  const result = getDatabase()
    .prepare(
      `UPDATE orders
       SET status = 'payment_rejected', error_message = ?, updated_at = ?
       WHERE id = ? AND tx_hash IS NULL AND status = 'verifying'`,
    )
    .run(reason, now(), orderId);

  if (Number(result.changes) === 0) {
    return false;
  }

  addOrderEvent(orderId, "payment.rejected", {
    reason,
    ...details,
  });
  return true;
}

export function releaseVerificationClaim(
  orderId: string,
  message: string | null = null,
) {
  getDatabase()
    .prepare(
      `UPDATE orders
       SET status = 'awaiting_payment', error_message = ?, updated_at = ?
       WHERE id = ? AND tx_hash IS NULL AND status = 'verifying'`,
    )
    .run(message, now(), orderId);

  return getOrderById(orderId);
}

export function claimOrderForProcessing(orderId: string) {
  const timestamp = now();
  const leaseCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const row = getDatabase()
    .prepare(
      `UPDATE orders
       SET status = ?, processing_attempts = processing_attempts + 1,
           processing_started_at = ?, updated_at = ?
       WHERE id = ?
         AND (
           status = 'payment_verified'
           OR status = 'failed'
           OR (
             status = 'processing'
             AND (processing_started_at IS NULL OR processing_started_at < ?)
           )
         )
       RETURNING processing_attempts`,
    )
    .get(
      "processing",
      timestamp,
      timestamp,
      orderId,
      leaseCutoff,
    ) as { processing_attempts: number } | undefined;

  if (!row) {
    return null;
  }

  addOrderEvent(orderId, "processing.started", {});
  return Number(row.processing_attempts);
}

export function completeOrder(
  orderId: string,
  quote: QuoteResult,
  processingAttempt: number,
) {
  const timestamp = now();
  const result = getDatabase()
    .prepare(
      `UPDATE orders
       SET status = ?, quote_result = ?, extraction_mode = ?,
           processed_at = ?, updated_at = ?, error_message = NULL,
           processing_started_at = NULL, source_text = ''
       WHERE id = ? AND status = 'processing'
         AND processing_attempts = ?`,
    )
    .run(
      "completed",
      JSON.stringify(quote),
      quote.extractionMode,
      timestamp,
      timestamp,
      orderId,
      processingAttempt,
    );

  if (Number(result.changes) === 0) {
    return false;
  }

  addOrderEvent(orderId, "processing.completed", {
    lineItems: quote.lineItems.length,
    validationIssues: quote.validationIssues.length,
    extractionMode: quote.extractionMode,
  });
  return true;
}

export function failOrder(
  orderId: string,
  message: string,
  processingAttempt: number,
) {
  const result = getDatabase()
    .prepare(
      `UPDATE orders
       SET status = 'failed', error_message = ?, processing_started_at = NULL,
           updated_at = ?
       WHERE id = ? AND status = 'processing'
         AND processing_attempts = ?`,
    )
    .run(message, now(), orderId, processingAttempt);

  if (Number(result.changes) === 0) {
    return false;
  }

  addOrderEvent(orderId, "processing.failed", { message });
  return true;
}

export function getStatusLabel(status: OrderStatus) {
  return orderStatusLabels[status];
}

export function cleanupStaleUnpaidOrders(maxAgeHours = 24) {
  const cutoff = new Date(
    Date.now() - maxAgeHours * 60 * 60_000,
  ).toISOString();

  return Number(
    getDatabase()
      .prepare(
        `DELETE FROM orders
         WHERE status = 'awaiting_payment' AND created_at < ?`,
      )
      .run(cutoff).changes,
  );
}
