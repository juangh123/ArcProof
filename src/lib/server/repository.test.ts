import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentProof } from "@/lib/domain/order";
import { resetDatabaseForTests } from "@/lib/server/db";
import {
  OrderConflictError,
  TransactionReuseError,
  claimOrderForProcessing,
  cleanupStaleUnpaidOrders,
  completeOrder,
  createOrder,
  failOrder,
  getOrderById,
  recordVerifiedPayment,
} from "@/lib/server/repository";
import { SAMPLE_QUOTE_TEXT } from "@/lib/server/sample";
import { extractQuoteHeuristically } from "@/lib/server/extract";

let dataDirectory = "";

function createTestOrder() {
  return createOrder({
    sourceName: "test-quote.txt",
    sourceKind: "text/plain",
    sourceText: SAMPLE_QUOTE_TEXT,
    amountDisplay: "0.10",
    recipientAddress: "0x1111111111111111111111111111111111111111",
    network: "testnet",
    chainId: 5_042_002,
    isPublic: false,
  });
}

function proofFor(
  txHash: `0x${string}`,
  order: ReturnType<typeof createTestOrder>,
): PaymentProof {
  return {
    txHash,
    blockNumber: "100",
    blockHash: `0x${"a".repeat(64)}`,
    payerAddress: "0x2222222222222222222222222222222222222222",
    recipientAddress: order.recipientAddress,
    memoId: order.paymentMemoId,
    amountNativeAtomic: order.amountAtomic18,
    amountErc20Atomic: order.amountAtomic6,
    canonicalEmitter: "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE",
    logIndex: 1,
    nativeEventOmitted: false,
    verificationMode: "fixture",
  };
}

beforeAll(() => {
  dataDirectory = mkdtempSync(path.join(tmpdir(), "arcproof-test-"));
  process.env.ARCPROOF_DATA_DIR = dataDirectory;
  process.env.ARCPROOF_DATABASE_PATH = path.join(
    dataDirectory,
    "arcproof.sqlite",
  );
});

beforeEach(() => {
  vi.useRealTimers();
  resetDatabaseForTests();

  const databasePath = process.env.ARCPROOF_DATABASE_PATH;

  if (databasePath) {
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(`${databasePath}${suffix}`, { force: true });
    }
  }
});

afterAll(() => {
  resetDatabaseForTests();
  rmSync(dataDirectory, { recursive: true, force: true });
});

describe("order repository", () => {
  it("binds a transaction to only one order", () => {
    const first = createTestOrder();
    const second = createTestOrder();
    const txHash = `0x${"1".repeat(64)}` as const;

    recordVerifiedPayment(first.id, proofFor(txHash, first));

    expect(() =>
      recordVerifiedPayment(second.id, proofFor(txHash, second)),
    ).toThrow(TransactionReuseError);
  });

  it("does not replace a verified transaction for the same order", () => {
    const order = createTestOrder();
    const firstTx = `0x${"2".repeat(64)}` as const;
    const secondTx = `0x${"3".repeat(64)}` as const;

    recordVerifiedPayment(order.id, proofFor(firstTx, order));

    expect(() =>
      recordVerifiedPayment(order.id, proofFor(secondTx, order)),
    ).toThrow(OrderConflictError);
  });

  it("retries a failed processing job without another payment", () => {
    const order = createTestOrder();
    const txHash = `0x${"4".repeat(64)}` as const;

    recordVerifiedPayment(order.id, proofFor(txHash, order));
    const firstAttempt = claimOrderForProcessing(order.id);
    expect(firstAttempt).toBe(1);
    failOrder(order.id, "Temporary parser failure", firstAttempt!);
    const retryAttempt = claimOrderForProcessing(order.id);
    expect(retryAttempt).toBe(2);
    expect(
      completeOrder(
        order.id,
        extractQuoteHeuristically(order.sourceText),
        retryAttempt!,
      ),
    ).toBe(true);
  });

  it("reclaims a processing job after its five-minute lease", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T00:00:00.000Z"));

    const order = createTestOrder();
    const txHash = `0x${"5".repeat(64)}` as const;

    recordVerifiedPayment(order.id, proofFor(txHash, order));
    expect(claimOrderForProcessing(order.id)).toBe(1);
    expect(claimOrderForProcessing(order.id)).toBeNull();

    vi.setSystemTime(new Date("2026-09-17T00:06:00.000Z"));
    expect(claimOrderForProcessing(order.id)).toBe(2);
  });

  it("does not allow an expired worker to overwrite a newer attempt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T00:00:00.000Z"));

    const order = createTestOrder();
    const txHash = `0x${"6".repeat(64)}` as const;

    recordVerifiedPayment(order.id, proofFor(txHash, order));
    const expiredAttempt = claimOrderForProcessing(order.id);
    expect(expiredAttempt).toBe(1);

    vi.setSystemTime(new Date("2026-09-17T00:06:00.000Z"));
    const currentAttempt = claimOrderForProcessing(order.id);
    expect(currentAttempt).toBe(2);

    expect(
      completeOrder(
        order.id,
        extractQuoteHeuristically(order.sourceText),
        expiredAttempt!,
      ),
    ).toBe(false);
    expect(getOrderById(order.id)?.status).toBe("processing");

    expect(
      completeOrder(
        order.id,
        extractQuoteHeuristically(order.sourceText),
        currentAttempt!,
      ),
    ).toBe(true);
    expect(getOrderById(order.id)?.status).toBe("completed");
  });

  it("cleans up unpaid orders after 24 hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T00:00:00.000Z"));
    createTestOrder();

    vi.setSystemTime(new Date("2026-09-18T00:01:00.000Z"));
    expect(cleanupStaleUnpaidOrders()).toBe(1);
  });
});
