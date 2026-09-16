const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
const command = process.argv[2];

if (!baseUrl) {
  throw new Error("PUBLIC_BASE_URL is required.");
}

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

async function createOrder() {
  const formData = new FormData();
  formData.set("sample", "true");

  const payload = await readJson(
    await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(30_000),
    }),
  );
  const order = payload.order;

  console.log(
    JSON.stringify(
      {
        orderId: order.id,
        publicId: order.publicId,
        amount: `${order.amountDisplay} USDC`,
        recipient: order.recipientAddress,
        memoId: order.paymentMemoId,
        proofUrl: `${baseUrl}${order.proofUrl}`,
      },
      null,
      2,
    ),
  );
  console.log(
    `\nPay ${order.amountDisplay} USDC in the ArcProof UI, then run:\n` +
      `pnpm smoke verify ${order.id} <TRANSACTION_HASH>`,
  );
}

async function verifyOrder(orderId, txHash) {
  if (!orderId || !txHash) {
    throw new Error("Usage: pnpm smoke verify <ORDER_ID> <TRANSACTION_HASH>");
  }

  let order;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/orders/${orderId}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHash }),
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status === 202) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      continue;
    }

    const payload = await readJson(response);
    order = payload.order;
    break;
  }

  if (!order) {
    throw new Error("The transaction did not reach final Arc verification.");
  }

  const processed = await readJson(
    await fetch(`${baseUrl}/api/orders/${orderId}/process`, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
    }),
  );
  const completed = processed.order;

  console.log(
    JSON.stringify(
      {
        publicId: completed.publicId,
        status: completed.status,
        txHash: completed.txHash,
        proofUrl: `${baseUrl}${completed.proofUrl}`,
        csvUrl: `${baseUrl}/api/orders/${completed.id}/csv`,
        lineItems: completed.quoteResult?.lineItems.length ?? 0,
      },
      null,
      2,
    ),
  );
}

if (command === "create") {
  await createOrder();
} else if (command === "verify") {
  await verifyOrder(process.argv[3], process.argv[4]);
} else {
  throw new Error("Usage: pnpm smoke <create|verify>");
}
