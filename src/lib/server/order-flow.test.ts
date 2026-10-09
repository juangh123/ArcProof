import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as csvGet } from "@/app/api/orders/[id]/csv/route";
import { GET as orderGet } from "@/app/api/orders/[id]/route";
import { GET as publicCsvGet } from "@/app/api/proof/[id]/csv/route";
import { POST as processPost } from "@/app/api/orders/[id]/process/route";
import { POST as resumePost } from "@/app/api/proof/[id]/resume/route";
import { POST as verifyPost } from "@/app/api/orders/[id]/verify/route";
import { POST as ordersPost } from "@/app/api/orders/route";
import type { OrderRecord, PaymentProof } from "@/lib/domain/order";
import { resetDatabaseForTests } from "@/lib/server/db";
import {
  MAX_PROCESSING_ATTEMPTS,
  claimOrderForProcessing,
  createOrder,
  failOrder,
  getOrderById,
  listRecentOrders,
  recordVerifiedPayment,
} from "@/lib/server/repository";
import { SAMPLE_QUOTE_TEXT } from "@/lib/server/sample";
import { csvCell } from "@/lib/server/csv";

let dataDirectory = "";
const recipient = "0x1111111111111111111111111111111111111111";

function createTestOrder(sourceText: string) {
  return createOrder({
    sourceName: "test-quote.txt",
    sourceKind: "text/plain",
    sourceText,
    amountDisplay: "0.10",
    recipientAddress: recipient,
    network: "testnet",
    chainId: 5_042_002,
  });
}

function proofFor(
  txHash: `0x${string}`,
  order: Pick<
    OrderRecord,
    "recipientAddress" | "paymentMemoId" | "amountAtomic18" | "amountAtomic6"
  >,
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

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function verifyRequest(id: string, txHash: string) {
  return verifyPost(
    new Request(`http://localhost/api/orders/${id}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHash }),
    }),
    routeContext(id),
  );
}

function processRequest(id: string) {
  return processPost(
    new Request(`http://localhost/api/orders/${id}/process`, {
      method: "POST",
    }),
    routeContext(id),
  );
}

function resumeRequest(publicId: string) {
  return resumePost(
    new Request(`http://localhost/api/proof/${publicId}/resume`, {
      method: "POST",
    }),
    routeContext(publicId),
  );
}

function ordersRequest(formData: FormData) {
  return ordersPost(
    new Request("http://localhost/api/orders", {
      method: "POST",
      body: formData,
    }),
  );
}

beforeAll(() => {
  dataDirectory = mkdtempSync(path.join(tmpdir(), "arcproof-flow-"));
  process.env.ARCPROOF_DATA_DIR = dataDirectory;
  process.env.ARCPROOF_DATABASE_PATH = path.join(
    dataDirectory,
    "arcproof.sqlite",
  );
  process.env.ARC_NETWORK = "testnet";
  process.env.ARC_PAYMENT_MODE = "fixture";
  process.env.ARC_RECIPIENT_ADDRESS = recipient;
  delete process.env.OPENAI_API_KEY;
});

beforeEach(() => {
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

describe("verify route", () => {
  it("refuses to verify an order created for a different network", async () => {
    const order = createTestOrder(SAMPLE_QUOTE_TEXT);
    process.env.ARC_NETWORK = "mainnet";
    process.env.ARC_PAYMENT_MODE = "live";

    try {
      const response = await verifyRequest(order.id, `0x${"9".repeat(64)}`);

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining("different Arc network"),
      });
    } finally {
      process.env.ARC_NETWORK = "testnet";
      process.env.ARC_PAYMENT_MODE = "fixture";
    }
  });

  it("does not downgrade an order that already recorded a payment", async () => {
    const order = createTestOrder(SAMPLE_QUOTE_TEXT);
    const txHash = `0x${"b".repeat(64)}` as const;

    recordVerifiedPayment(order.id, proofFor(txHash, order));
    const attempt = claimOrderForProcessing(order.id);
    expect(attempt).toBe(1);
    failOrder(order.id, "parser failed", attempt!);
    expect(getOrderById(order.id)?.status).toBe("failed");

    const response = await verifyRequest(order.id, txHash);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      order: { status: string; txHash: string };
    };
    expect(payload.order.status).toBe("failed");
    expect(payload.order.txHash).toBe(txHash);
  });

  it("still rejects a different transaction for a bound order", async () => {
    const order = createTestOrder(SAMPLE_QUOTE_TEXT);
    const txHash = `0x${"c".repeat(64)}` as const;
    recordVerifiedPayment(order.id, proofFor(txHash, order));

    const response = await verifyRequest(order.id, `0x${"d".repeat(64)}`);

    expect(response.status).toBe(409);
  });

  it("keeps a verified order intact when the same payment is verified again", async () => {
    const order = createTestOrder(SAMPLE_QUOTE_TEXT);
    const txHash = `0x${"2".repeat(64)}` as const;

    const first = await verifyRequest(order.id, txHash);
    expect(first.status).toBe(200);
    expect(getOrderById(order.id)?.status).toBe("payment_verified");

    const second = await verifyRequest(order.id, txHash);
    expect(second.status).toBe(200);

    const payload = (await second.json()) as {
      order: { status: string; txHash: string };
    };
    expect(payload.order.status).toBe("payment_verified");
    expect(payload.order.txHash).toBe(txHash);
    expect(getOrderById(order.id)?.status).toBe("payment_verified");

    const processed = await processRequest(order.id);
    expect(processed.status).toBe(200);
    expect(
      ((await processed.json()) as { order: { status: string } }).order.status,
    ).toBe("completed");
  });

  it("does not downgrade a paid order when a stale verify request resumes after verification", async () => {
    const order = createTestOrder(SAMPLE_QUOTE_TEXT);
    const txHash = `0x${"7".repeat(64)}` as const;
    const encoder = new TextEncoder();
    let releaseBody = () => {};
    let markBodyStarted = () => {};
    const bodyStarted = new Promise<void>((resolve) => {
      markBodyStarted = resolve;
    });
    let pullStarted = false;

    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!pullStarted) {
          pullStarted = true;
          markBodyStarted();
        }

        return new Promise<void>((resolve) => {
          releaseBody = () => {
            controller.enqueue(encoder.encode(JSON.stringify({ txHash })));
            controller.close();
            resolve();
          };
        });
      },
    });

    const staleRequest = verifyPost(
      new Request(`http://localhost/api/orders/${order.id}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        duplex: "half",
      } as RequestInit & { duplex: "half" }),
      routeContext(order.id),
    );

    // The stale request has read the unpaid order and is now waiting on its
    // body, which lets the first verification finish in between.
    await bodyStarted;

    const verified = await verifyRequest(order.id, txHash);
    expect(verified.status).toBe(200);
    expect(getOrderById(order.id)?.status).toBe("payment_verified");

    releaseBody();
    const staleResponse = await staleRequest;
    expect(staleResponse.status).toBe(200);

    const stalePayload = (await staleResponse.json()) as {
      order: { status: string; txHash: string };
    };
    expect(stalePayload.order.status).toBe("payment_verified");
    expect(stalePayload.order.txHash).toBe(txHash);
    expect(getOrderById(order.id)?.status).toBe("payment_verified");

    const processed = await processRequest(order.id);
    expect(processed.status).toBe(200);
    expect(
      ((await processed.json()) as { order: { status: string } }).order.status,
    ).toBe("completed");
  });
});

describe("order creation preflight", () => {
  it("returns a stored order without releasing its draft early", async () => {
    const order = createTestOrder(SAMPLE_QUOTE_TEXT);

    const response = await orderGet(
      new Request(`http://localhost/api/orders/${order.id}`),
      routeContext(order.id),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      order: { id: string; status: string; quoteResult: unknown };
    };
    expect(payload.order.id).toBe(order.id);
    expect(payload.order.status).toBe("awaiting_payment");
    expect(payload.order.quoteResult).toBeNull();
  });

  it("returns 404 for an unknown order id", async () => {
    const response = await orderGet(
      new Request("http://localhost/api/orders/missing-order"),
      routeContext("missing-order"),
    );

    expect(response.status).toBe(404);
  });

  it("rejects an unextractable document before creating a payment order", async () => {
    const before = listRecentOrders(100).length;
    const formData = new FormData();
    formData.set(
      "file",
      new File(["A friendly note with no quotation table."], "notes.txt", {
        type: "text/plain",
      }),
    );

    const response = await ordersRequest(formData);

    expect(response.status).toBe(422);
    expect(listRecentOrders(100)).toHaveLength(before);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("No structured line items"),
    });
  });

  it("stores a validated draft but hides it until payment is verified", async () => {
    const formData = new FormData();
    formData.set("sample", "true");

    const response = await ordersRequest(formData);

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      order: {
        id: string;
        quoteResult: unknown;
      };
    };
    expect(payload.order.quoteResult).toBeNull();

    const stored = getOrderById(payload.order.id);
    expect(stored?.sourceText).toBe("");
    expect(stored?.quoteResult?.lineItems).toHaveLength(3);

    const txHash = `0x${"a".repeat(64)}` as const;
    recordVerifiedPayment(payload.order.id, proofFor(txHash, stored!));

    const processed = await processRequest(payload.order.id);
    expect(processed.status).toBe(200);
    await expect(processed.json()).resolves.toMatchObject({
      order: {
        status: "completed",
        quoteResult: {
          lineItems: [
            { sku: "ALU-6061" },
            { sku: "FST-M8-80" },
            { sku: "GSK-NBR-2" },
          ],
        },
      },
    });
  });
});

describe("process route", () => {
  it("fails instead of releasing an empty paid result", async () => {
    const order = createTestOrder("Just a friendly note with no table.");
    const txHash = `0x${"e".repeat(64)}` as const;
    recordVerifiedPayment(order.id, proofFor(txHash, order));

    const response = await processRequest(order.id);

    expect(response.status).toBe(500);
    const payload = (await response.json()) as {
      order: { status: string };
    };
    expect(payload.order.status).toBe("failed");
    expect(getOrderById(order.id)?.quoteResult).toBeNull();
  });

  it("completes a parseable quotation", async () => {
    const order = createTestOrder(SAMPLE_QUOTE_TEXT);
    const txHash = `0x${"f".repeat(64)}` as const;
    recordVerifiedPayment(order.id, proofFor(txHash, order));

    const response = await processRequest(order.id);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      order: {
        status: string;
        quoteResult: { lineItems: unknown[] };
      };
    };
    expect(payload.order.status).toBe("completed");
    expect(payload.order.quoteResult.lineItems).toHaveLength(3);
  });
});

describe("resume route", () => {
  it("refuses to process an order whose payment is not verified", async () => {
    const order = createTestOrder(SAMPLE_QUOTE_TEXT);

    const response = await resumeRequest(order.publicId);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("must be verified"),
    });
  });

  it("completes a verified order from its public receipt", async () => {
    const order = createTestOrder(SAMPLE_QUOTE_TEXT);
    recordVerifiedPayment(order.id, proofFor(`0x${"c".repeat(64)}`, order));

    const response = await resumeRequest(order.publicId);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "completed" });
    expect(getOrderById(order.id)?.status).toBe("completed");
  });

  it("reports the retry limit instead of reclaiming a permanently failed order", async () => {
    const order = createTestOrder("Just a friendly note with no table.");
    recordVerifiedPayment(order.id, proofFor(`0x${"d".repeat(64)}`, order));

    for (let attempt = 1; attempt <= MAX_PROCESSING_ATTEMPTS; attempt += 1) {
      const claimed = claimOrderForProcessing(order.id);

      expect(claimed).toBe(attempt);
      failOrder(order.id, "parser failed", claimed!);
    }

    const response = await resumeRequest(order.publicId);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("retry limit"),
    });
  });
});

describe("csv export", () => {
  it("neutralizes spreadsheet formulas in untrusted cells", () => {
    expect(csvCell("=1+1")).toBe('"\'=1+1"');
    expect(csvCell("+SUM(A1)")).toBe('"\'+SUM(A1)"');
    expect(csvCell("-2+3")).toBe('"\'-2+3"');
    expect(csvCell("@cmd")).toBe('"\'@cmd"');
    expect(csvCell("Plain text")).toBe('"Plain text"');
    expect(csvCell(3)).toBe('"3"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("withholds the CSV until the paid order is completed", async () => {
    const formData = new FormData();
    formData.set("sample", "true");

    const createdResponse = await ordersRequest(formData);
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      order: { id: string; publicId: string; status: string };
    };
    expect(created.order.status).toBe("awaiting_payment");

    const unpaidPrivate = await csvGet(
      new Request(`http://localhost/api/orders/${created.order.id}/csv`),
      routeContext(created.order.id),
    );
    expect(unpaidPrivate.status).toBe(404);

    const unpaidPublic = await publicCsvGet(
      new Request(`http://localhost/api/proof/${created.order.publicId}/csv`),
      routeContext(created.order.publicId),
    );
    expect(unpaidPublic.status).toBe(404);

    const stored = getOrderById(created.order.id);
    expect(stored).not.toBeNull();
    recordVerifiedPayment(stored!.id, proofFor(`0x${"8".repeat(64)}`, stored!));

    const processed = await processRequest(stored!.id);
    expect(processed.status).toBe(200);

    const paidPrivate = await csvGet(
      new Request(`http://localhost/api/orders/${stored!.id}/csv`),
      routeContext(stored!.id),
    );
    expect(paidPrivate.status).toBe(200);
    await expect(paidPrivate.text()).resolves.toContain("ALU-6061");
  });

  it("returns the exported CSV through the route", async () => {
    const order = createTestOrder(SAMPLE_QUOTE_TEXT);
    const txHash = `0x${"1".repeat(64)}` as const;
    recordVerifiedPayment(order.id, proofFor(txHash, order));

    const processed = await processRequest(order.id);
    expect(processed.status).toBe(200);

    const response = await csvGet(
      new Request(`http://localhost/api/orders/${order.id}/csv`),
      routeContext(order.id),
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("ALU-6061");
    expect(body).toContain("line_number");

    const publicResponse = await publicCsvGet(
      new Request(`http://localhost/api/proof/${order.publicId}/csv`),
      routeContext(order.publicId),
    );

    expect(publicResponse.status).toBe(200);
    expect(await publicResponse.text()).toContain("ALU-6061");
  });
});
