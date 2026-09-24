"use client";

import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  FileText,
  Loader2,
  RefreshCw,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Upload,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { PublicArcConfig } from "@/lib/arc/config";
import { payOrderWithArc } from "@/lib/arc/wallet";
import type { SerializedOrder } from "@/lib/api/serialize";
import { orderStatusLabels } from "@/lib/domain/order";
import { QuoteResultView } from "@/components/quote-result";

type ApiResponse = {
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
const ACTIVE_ORDER_MAX_AGE = 7 * 24 * 60 * 60_000;

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly order: SerializedOrder | null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function readResponse(response: Response) {
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

function readStoredOrder(): StoredOrder | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(ACTIVE_ORDER_KEY);

    if (!raw) {
      return null;
    }

    const stored = JSON.parse(raw) as Partial<StoredOrder>;
    const isFresh =
      typeof stored.savedAt === "number" &&
      Date.now() - stored.savedAt < ACTIVE_ORDER_MAX_AGE;
    const hasValidHash =
      stored.txHash === undefined ||
      /^0x[0-9a-f]{64}$/i.test(stored.txHash);
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

function storeOrder(orderId: string, txHash?: `0x${string}`) {
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

function clearStoredOrder() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ACTIVE_ORDER_KEY);
  }
}

async function fetchOrder(orderId: string) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
    cache: "no-store",
  });
  const payload = await readResponse(response);

  if (!payload.order) {
    throw new ApiRequestError("Order not found.", 404, null);
  }

  return payload.order;
}

async function requestPaymentVerification(
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

async function requestOrderProcessing(orderId: string) {
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

function shorten(value: string | null | undefined, visible = 8) {
  if (!value) {
    return "—";
  }

  return `${value.slice(0, visible + 2)}…${value.slice(-visible)}`;
}

function createFixtureHash() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}` as `0x${string}`;
}

function statusClass(status: SerializedOrder["status"]) {
  if (
    status === "payment_verified" ||
    status === "processing" ||
    status === "completed"
  ) {
    return "status-pill status-positive";
  }

  if (status === "payment_rejected" || status === "failed") {
    return "status-pill status-negative";
  }

  return "status-pill";
}

function currentStep(order: SerializedOrder | null) {
  if (!order) {
    return 1;
  }
  if (order.status === "completed") {
    return 3;
  }
  if (
    order.status === "payment_verified" ||
    order.status === "processing"
  ) {
    return 3;
  }
  return 2;
}

export function Workbench({ config }: { config: PublicArcConfig }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [order, setOrder] = useState<SerializedOrder | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const step = currentStep(order);
  const paymentReady = Boolean(config.configured && order);

  useEffect(() => {
    const storedOrder = readStoredOrder();

    if (!storedOrder) {
      return;
    }

    const stored = storedOrder;
    let active = true;

    async function restoreOrder() {
      setIsRestoring(true);
      setNotice("Restoring your active order.");

      try {
        let restoredOrder = await fetchOrder(stored.orderId);

        if (!active) {
          return;
        }

        setOrder(restoredOrder);
        storeOrder(restoredOrder.id, stored.txHash);

        if (
          stored.txHash &&
          (restoredOrder.status === "awaiting_payment" ||
            restoredOrder.status === "verifying")
        ) {
          setIsPaying(true);
          setNotice("Resuming Arc payment verification.");
          restoredOrder = await requestPaymentVerification(
            restoredOrder.id,
            stored.txHash,
          );

          if (!active) {
            return;
          }

          setOrder(restoredOrder);
          storeOrder(restoredOrder.id);
          setNotice("Arc payment verified.");
        }

        if (restoredOrder.status === "payment_verified") {
          setIsProcessing(true);
          setNotice("Extracting line items.");
          restoredOrder = await requestOrderProcessing(restoredOrder.id);

          if (!active) {
            return;
          }

          setOrder(restoredOrder);
          setNotice("Structured quotation generated.");
        } else if (restoredOrder.status === "processing") {
          setNotice(
            "Processing is already in progress. Resume it if the previous attempt stopped.",
          );
        } else if (restoredOrder.status === "failed") {
          setNotice("The previous processing attempt needs a retry.");
        } else if (restoredOrder.status === "completed") {
          setNotice("Completed order restored.");
        } else {
          setNotice("Active order restored. Continue payment when ready.");
        }
      } catch (requestError) {
        if (!active) {
          return;
        }

        if (requestError instanceof ApiRequestError) {
          if (requestError.order) {
            setOrder(requestError.order);
            storeOrder(requestError.order.id);
          }

          if (requestError.status === 404) {
            clearStoredOrder();
          }
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "The active order could not be restored.",
        );
      } finally {
        if (active) {
          setIsPaying(false);
          setIsProcessing(false);
          setIsRestoring(false);
        }
      }
    }

    void restoreOrder();

    return () => {
      active = false;
    };
  }, []);

  const networkTone = useMemo(() => {
    if (config.network === "mainnet") {
      return "network-pill network-mainnet";
    }
    return "network-pill network-testnet";
  }, [config.network]);

  async function createOrder(options: { sample: boolean; file?: File }) {
    setIsCreating(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();

      if (options.sample) {
        formData.set("sample", "true");
      } else if (options.file) {
        formData.set("file", options.file);
      }

      const response = await fetch("/api/orders", {
        method: "POST",
        body: formData,
      });
      const payload = await readResponse(response);

      if (!payload.order) {
        throw new Error("The order was created without a payment request.");
      }

      setOrder(payload.order);
      storeOrder(payload.order.id);
      setNotice("Payment request created.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The document could not be prepared.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function processOrder(orderId: string, existingOrder?: SerializedOrder) {
    setIsProcessing(true);
    setError("");

    try {
      if (
        existingOrder &&
        existingOrder.status === "completed"
      ) {
        return;
      }

      const processedOrder = await requestOrderProcessing(orderId);
      setOrder(processedOrder);
      storeOrder(processedOrder.id);
      setNotice("Structured quotation generated.");
    } catch (requestError) {
      if (
        requestError instanceof ApiRequestError &&
        requestError.order
      ) {
        setOrder(requestError.order);
        storeOrder(requestError.order.id);
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "The quotation could not be processed.",
      );
    } finally {
      setIsProcessing(false);
    }
  }

  async function verifyPayment(orderId: string, txHash: `0x${string}`) {
    const verifiedOrder = await requestPaymentVerification(orderId, txHash);
    setOrder(verifiedOrder);
    storeOrder(verifiedOrder.id);
    setNotice("Arc payment verified.");
    await processOrder(orderId, verifiedOrder);
  }

  async function payWithArc() {
    if (!order) {
      return;
    }

    setIsPaying(true);
    setError("");
    setNotice("Approve the USDC payment in your wallet.");

    try {
      const txHash =
        config.paymentMode === "fixture"
          ? createFixtureHash()
          : await payOrderWithArc({ config, order });
      storeOrder(order.id, txHash);
      setNotice("Transaction submitted to Arc.");
      await verifyPayment(order.id, txHash);
    } catch (paymentError) {
      if (
        paymentError instanceof ApiRequestError &&
        paymentError.order
      ) {
        setOrder(paymentError.order);
        storeOrder(paymentError.order.id);
      }

      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "The Arc payment could not be completed.",
      );
    } finally {
      setIsPaying(false);
    }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setError("");
  }

  function resetOrder() {
    clearStoredOrder();
    setOrder(null);
    setFile(null);
    setNotice("");
    setError("");
    if (fileInput.current) {
      fileInput.current.value = "";
    }
  }

  async function copyMemo() {
    if (!order) {
      return;
    }

    await navigator.clipboard.writeText(order.paymentMemoId);
    setNotice("Memo identifier copied.");
  }

  return (
    <div className="workbench-grid">
      <section className="panel intake-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Intake</div>
            <h2>Supplier quotation</h2>
          </div>
          <span className={networkTone}>
            <span className="network-dot" />
            {config.name}
          </span>
        </div>

        <ol className="step-strip">
          {[
            ["1", "Quote"],
            ["2", "Payment"],
            ["3", "Result"],
          ].map(([number, label], index) => {
            const numberValue = index + 1;
            const completed = step > numberValue;
            const active = step === numberValue;

            return (
              <li
                key={label}
                className={
                  completed
                    ? "step-complete"
                    : active
                      ? "step-active"
                      : ""
                }
              >
                <span>{completed ? <Check size={13} /> : number}</span>
                {label}
              </li>
            );
          })}
        </ol>

        {!order ? (
          <>
            <div className="drop-zone">
              <FileText size={30} strokeWidth={1.5} />
              <div>
                <strong>PDF or text quotation</strong>
                <span>Up to 8 MB</span>
              </div>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={16} />
                Choose file
              </button>
              <input
                ref={fileInput}
                className="sr-only"
                type="file"
                accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                onChange={selectFile}
              />
            </div>

            {file ? (
              <div className="selected-file">
                <FileText size={17} />
                <span>{file.name}</span>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => createOrder({ sample: false, file })}
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <Loader2 className="spin" size={15} />
                  ) : (
                    <ArrowRight size={15} />
                  )}
                  Create order
                </button>
              </div>
            ) : null}

            <div className="or-divider">
              <span>or</span>
            </div>

            <button
              className="button button-primary button-wide"
              type="button"
              onClick={() => createOrder({ sample: true })}
              disabled={isCreating || isRestoring}
            >
              {isCreating ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              Use sample quotation
            </button>
          </>
        ) : (
          <div className="order-summary">
            <div className="file-line">
              <FileText size={19} />
              <div>
                <strong>{order.sourceName}</strong>
                <span>{order.publicId}</span>
              </div>
              <span className={statusClass(order.status)}>
                {orderStatusLabels[order.status]}
              </span>
            </div>

            <dl className="detail-list">
              <div>
                <dt>Price</dt>
                <dd>{order.amountDisplay} USDC</dd>
              </div>
              <div>
                <dt>Memo ID</dt>
                <dd className="mono">{shorten(order.paymentMemoId, 9)}</dd>
              </div>
              <div>
                <dt>Recipient</dt>
                <dd className="mono">
                  {shorten(config.recipientAddress, 7)}
                </dd>
              </div>
            </dl>

            {order.status === "awaiting_payment" ||
            order.status === "payment_rejected" ? (
              <button
                className="button button-primary button-wide"
                type="button"
                onClick={payWithArc}
                disabled={
                  !paymentReady || isPaying || isProcessing || isRestoring
                }
              >
                {isPaying ? (
                  <Loader2 className="spin" size={17} />
                ) : (
                  <WalletCards size={17} />
                )}
                {config.paymentMode === "fixture"
                  ? "Verify fixture payment"
                  : `Pay ${order.amountDisplay} USDC`}
              </button>
            ) : null}

            {(order.status === "failed" ||
              order.status === "processing") &&
            order.paymentProof ? (
              <button
                className="button button-primary button-wide"
                type="button"
                onClick={() => processOrder(order.id, order)}
                disabled={isProcessing || isPaying || isRestoring}
              >
                {isProcessing ? (
                  <Loader2 className="spin" size={17} />
                ) : (
                  <RefreshCw size={17} />
                )}
                {order.status === "failed"
                  ? "Retry processing"
                  : "Resume processing"}
              </button>
            ) : null}

            {!config.configured ? (
              <div className="inline-alert inline-alert-error">
                <AlertCircle size={16} />
                Arc receiving address is not configured.
              </div>
            ) : null}

            <div className="order-actions">
              <button
                className="text-button"
                type="button"
                onClick={copyMemo}
              >
                <Copy size={14} />
                Copy memo
              </button>
              <a
                className="text-button"
                href={order.proofUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ReceiptText size={14} />
                Public receipt
              </a>
              <button
                className="text-button"
                type="button"
                onClick={resetOrder}
              >
                <RefreshCw size={14} />
                New quote
              </button>
            </div>
          </div>
        )}

        {notice || error ? (
          <div
            className={
              error
                ? "inline-alert inline-alert-error"
                : "inline-alert inline-alert-info"
            }
          >
            {error ? (
              <AlertCircle size={16} />
            ) : isProcessing || isPaying ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <CheckCircle2 size={16} />
            )}
            {error || notice}
          </div>
        ) : null}

        <div className="trust-strip">
          <span>
            <ShieldCheck size={15} />
            Server-side chain verification
          </span>
          <span>
            <CircleDollarSign size={15} />
            One payment, one result
          </span>
        </div>
      </section>

      <section className="panel result-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Output</div>
            <h2>Structured quotation</h2>
          </div>
          {order?.paymentProof ? (
            <span className="status-pill status-positive">
              <ShieldCheck size={14} />
              Arc verified
            </span>
          ) : null}
        </div>

        {!order ? (
          <div className="empty-state large-empty-state">
            <ReceiptText size={34} strokeWidth={1.4} />
            <strong>Waiting for a quotation</strong>
            <span>
              The document becomes available after the payment is final on
              Arc.
            </span>
          </div>
        ) : (
          <>
            <div className="receipt-strip">
              <div>
                <span>Order</span>
                <strong>{order.publicId}</strong>
              </div>
              <div>
                <span>Payment</span>
                <strong>{order.amountDisplay} USDC</strong>
              </div>
              <div>
                <span>Chain ID</span>
                <strong>{order.chainId}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{orderStatusLabels[order.status]}</strong>
              </div>
            </div>

            {isProcessing && !order.quoteResult ? (
              <div className="processing-state">
                <Loader2 className="spin" size={28} />
                <strong>Extracting line items</strong>
                <span>Checking totals and document consistency.</span>
              </div>
            ) : (
              <QuoteResultView order={order} />
            )}
          </>
        )}
      </section>
    </div>
  );
}
