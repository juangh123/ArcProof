import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabaseForTests } from "@/lib/server/db";
import {
  claimOrderForProcessing,
  completeOrder,
  createOrder,
  getOrderById,
  getOrderEvents,
  recordVerifiedPayment,
} from "@/lib/server/repository";
import {
  getResultRetentionDays,
  getRetentionExemptPublicIds,
  runRetention,
} from "@/lib/server/retention";
import { SAMPLE_QUOTE_TEXT } from "@/lib/server/sample";
import type { PaymentProof } from "@/lib/domain/order";

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

function finishOrder(order: ReturnType<typeof createTestOrder>) {
  const txHash = `0x${order.id.replace(/-/g, "").slice(0, 4).padEnd(64, "f")}` as `0x${string}`;

  recordVerifiedPayment(order.id, proofFor(txHash, order));
  const attempt = claimOrderForProcessing(order.id);

  expect(attempt).toBe(1);

  const completed = completeOrder(
    order.id,
    {
      supplier: "Test supplier",
      quoteNumber: "",
      issuedDate: "",
      currency: "USD",
      lineItems: [
        {
          lineNumber: 1,
          sku: "SKU-1",
          description: "Test item",
          quantity: 1,
          unit: "piece",
          unitPrice: 1,
          lineTotal: 1,
        },
      ],
      subtotal: 1,
      tax: 0,
      total: 1,
      confidence: 1,
      validationIssues: [],
      extractionMode: "heuristic",
    },
    attempt!,
  );

  expect(completed).toBe(true);
  return order;
}

beforeAll(() => {
  dataDirectory = mkdtempSync(path.join(tmpdir(), "arcproof-retention-"));
  process.env.ARCPROOF_DATA_DIR = dataDirectory;
  process.env.ARCPROOF_DATABASE_PATH = path.join(
    dataDirectory,
    "arcproof.sqlite",
  );
});

beforeEach(() => {
  vi.useRealTimers();
  resetDatabaseForTests();
  delete process.env.ARCPROOF_RESULT_RETENTION_DAYS;
  delete process.env.ARCPROOF_RETENTION_EXEMPT_IDS;

  const databasePath = process.env.ARCPROOF_DATABASE_PATH;

  if (databasePath) {
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(`${databasePath}${suffix}`, { force: true });
    }
  }
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  resetDatabaseForTests();
  rmSync(dataDirectory, { recursive: true, force: true });
});

describe("retention configuration", () => {
  it("keeps result redaction disabled unless a positive day count is set", () => {
    expect(getResultRetentionDays({})).toBeNull();
    expect(getResultRetentionDays({ ARCPROOF_RESULT_RETENTION_DAYS: "0" })).toBeNull();
    expect(getResultRetentionDays({ ARCPROOF_RESULT_RETENTION_DAYS: "-5" })).toBeNull();
    expect(getResultRetentionDays({ ARCPROOF_RESULT_RETENTION_DAYS: "nope" })).toBeNull();
    expect(getResultRetentionDays({ ARCPROOF_RESULT_RETENTION_DAYS: "90" })).toBe(90);
  });

  it("parses the exemption list and drops empty entries", () => {
    expect(
      getRetentionExemptPublicIds({
        ARCPROOF_RETENTION_EXEMPT_IDS: " AP-AC247758 , AP-ABC123 , ",
      }),
    ).toEqual(["AP-AC247758", "AP-ABC123"]);
    expect(getRetentionExemptPublicIds({})).toEqual([]);
  });
});

describe("result retention", () => {
  it("keeps completed results while the policy is disabled", () => {
    finishOrder(createTestOrder());

    const result = runRetention();

    expect(result.redactedPublicIds).toEqual([]);
  });

  it("redacts only results older than the window, sparing exempt orders", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const expiring = finishOrder(createTestOrder());
    const exempt = finishOrder(createTestOrder());

    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    const recent = finishOrder(createTestOrder());

    vi.setSystemTime(new Date("2026-06-02T00:00:00.000Z"));
    process.env.ARCPROOF_RESULT_RETENTION_DAYS = "90";
    process.env.ARCPROOF_RETENTION_EXEMPT_IDS = exempt.publicId;

    const result = runRetention();

    expect(result.redactedPublicIds).toEqual([expiring.publicId]);
    expect(getOrderById(expiring.id)?.quoteResult).toBeNull();
    expect(getOrderById(expiring.id)?.resultRedactedAt).toBe(
      "2026-06-02T00:00:00.000Z",
    );
    expect(getOrderById(expiring.id)?.txHash).toContain("0x");
    expect(getOrderById(exempt.id)?.quoteResult).not.toBeNull();
    expect(getOrderById(recent.id)?.quoteResult).not.toBeNull();
    expect(getOrderEvents(expiring.id).map((event) => event.type)).toContain(
      "result.redacted",
    );
  });

  it("is idempotent once a payload has been redacted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const order = finishOrder(createTestOrder());

    vi.setSystemTime(new Date("2026-06-02T00:00:00.000Z"));
    process.env.ARCPROOF_RESULT_RETENTION_DAYS = "90";

    expect(runRetention().redactedPublicIds).toEqual([order.publicId]);
    expect(runRetention().redactedPublicIds).toEqual([]);
  });
});
