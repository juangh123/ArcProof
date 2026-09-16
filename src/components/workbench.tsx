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
import { useMemo, useRef, useState } from "react";
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

async function readResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as ApiResponse;

  if (!response.ok) {
    throw new Error(payload.error || "The request failed.");
  }

  return payload;
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
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const step = currentStep(order);
  const paymentReady = Boolean(config.configured && order);

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

      const response = await fetch(`/api/orders/${orderId}/process`, {
        method: "POST",
      });
      const payload = await readResponse(response);

      if (payload.order) {
        setOrder(payload.order);
      }
      setNotice("Structured quotation generated.");
    } catch (requestError) {
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
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await fetch(`/api/orders/${orderId}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txHash }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiResponse;

      if (response.status === 202) {
        setNotice("Transaction submitted. Waiting for Arc finality.");
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        continue;
      }

      if (!response.ok) {
        if (payload.order) {
          setOrder(payload.order);
        }
        throw new Error(payload.error || "Arc payment verification failed.");
      }

      if (!payload.order) {
        throw new Error("Arc verification returned no order.");
      }

      setOrder(payload.order);
      setNotice("Arc payment verified.");
      await processOrder(orderId, payload.order);
      return;
    }

    throw new Error(
      "The transaction is still pending. Keep the transaction hash and verify again shortly.",
    );
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
      setNotice("Transaction submitted to Arc.");
      await verifyPayment(order.id, txHash);
    } catch (paymentError) {
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
              disabled={isCreating}
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
                disabled={!paymentReady || isPaying || isProcessing}
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

            {order.status === "failed" && order.paymentProof ? (
              <button
                className="button button-primary button-wide"
                type="button"
                onClick={() => processOrder(order.id, order)}
                disabled={isProcessing || isPaying}
              >
                {isProcessing ? (
                  <Loader2 className="spin" size={17} />
                ) : (
                  <RefreshCw size={17} />
                )}
                Retry processing
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
