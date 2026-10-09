import type { SerializedOrder } from "@/lib/api/serialize";
import { ORDER_PAYMENT_WINDOW_MS } from "@/lib/domain/order";

export type ApiResponse = {
  order?: SerializedOrder | null;
  error?: string;
  message?: string;
  status?: string;
};

type StoredOrder = {
  orderId: string;
  txHash?: `0x${string}`;
  savedAt: number;
};

const ACTIVE_ORDER_KEY = "arcproof.active-order.v1";
const ACTIVE_ORDER_MAX_AGE = ORDER_PAYMENT_WINDOW_MS;
const PENDING_ORDER_MAX_AGE = 30 * 24 * 60 * 60_000;

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly order: SerializedOrder | null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function readResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as ApiResponse;

  if (!response.ok) {
    throw new ApiRequestError(
      payload.error || "The request failed.",
      response.status,
      payload.order ?? null,
    );
  }

  return payload;
}

export function readStoredOrder(): StoredOrder | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(ACTIVE_ORDER_KEY);

    if (!raw) {
      return null;
    }

    const stored = JSON.parse(raw) as Partial<StoredOrder>;
    const hasValidHash =
      stored.txHash === undefined ||
      /^0x[0-9a-f]{64}$/i.test(stored.txHash);
    const maxAge = stored.txHash
      ? PENDING_ORDER_MAX_AGE
      : ACTIVE_ORDER_MAX_AGE;
    const isFresh =
      typeof stored.savedAt === "number" &&
      Date.now() - stored.savedAt < maxAge;
    const savedAt = stored.savedAt;

    if (
      !isFresh ||
      typeof savedAt !== "number" ||
      typeof stored.orderId !== "string" ||
      !stored.orderId ||
      !hasValidHash
    ) {
      window.localStorage.removeItem(ACTIVE_ORDER_KEY);
      return null;
    }

    return {
      orderId: stored.orderId,
      txHash: stored.txHash as `0x${string}` | undefined,
      savedAt,
    };
  } catch {
    window.localStorage.removeItem(ACTIVE_ORDER_KEY);
    return null;
  }
}

export function storeOrder(orderId: string, txHash?: `0x${string}`) {
  if (typeof window === "undefined") {
    return;
  }

  const stored: StoredOrder = {
    orderId,
    savedAt: Date.now(),
  };

  if (txHash) {
    stored.txHash = txHash;
  }

  window.localStorage.setItem(ACTIVE_ORDER_KEY, JSON.stringify(stored));
}

export function clearStoredOrder() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ACTIVE_ORDER_KEY);
  }
}

export async function createOrderRequest(formData: FormData) {
  const response = await fetch("/api/orders", {
    method: "POST",
    body: formData,
  });
  const payload = await readResponse(response);

  if (!payload.order) {
    throw new ApiRequestError(
      "The order was created without a payment request.",
      response.status,
      null,
    );
  }

  return payload.order;
}

export async function fetchOrder(orderId: string) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
    cache: "no-store",
  });
  const payload = await readResponse(response);

  if (!payload.order) {
    throw new ApiRequestError("Order not found.", 404, null);
  }

  return payload.order;
}

export async function requestPaymentVerification(
  orderId: string,
  txHash: `0x${string}`,
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(
      `/api/orders/${encodeURIComponent(orderId)}/verify`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txHash }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as ApiResponse;

    if (response.status === 202) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      continue;
    }

    if (!response.ok) {
      throw new ApiRequestError(
        payload.error || "Arc payment verification failed.",
        response.status,
        payload.order ?? null,
      );
    }

    if (!payload.order) {
      throw new ApiRequestError(
        "Arc verification returned no order.",
        response.status,
        null,
      );
    }

    return payload.order;
  }

  throw new ApiRequestError(
    "The transaction is still pending. Keep the transaction hash and verify again shortly.",
    202,
    null,
  );
}

export async function requestOrderProcessing(orderId: string) {
  const response = await fetch(
    `/api/orders/${encodeURIComponent(orderId)}/process`,
    {
      method: "POST",
    },
  );
  const payload = await readResponse(response);

  if (!payload.order) {
    throw new ApiRequestError(
      "The processing request returned no order.",
      response.status,
      null,
    );
  }

  return payload.order;
}

export function createFixtureHash() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return `0x${Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}` as `0x${string}`;
}
