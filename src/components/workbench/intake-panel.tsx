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
import type { PublicArcConfig } from "@/lib/arc/config";
import { orderStatusLabels } from "@/lib/domain/order";
import {
  shorten,
  statusClass,
} from "@/components/workbench/presentation";
import type {
  WorkbenchActions,
  WorkbenchView,
} from "@/components/use-workbench-order";

export function IntakePanel({
  config,
  view,
  actions,
}: {
  config: PublicArcConfig;
  view: WorkbenchView;
  actions: WorkbenchActions;
}) {
  const {
    fileInput,
    order,
    file,
    step,
    isCreating,
    isPaying,
    isProcessing,
    isRestoring,
    pendingTxHash,
    paymentReady,
    paymentExpired,
    paymentTargetMatches,
    supportUrl,
    notice,
    error,
  } = view;
  const networkTone =
    config.network === "mainnet"
      ? "network-pill network-mainnet"
      : "network-pill network-testnet";

  return (
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
                completed ? "step-complete" : active ? "step-active" : ""
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
              onChange={actions.selectFile}
            />
          </div>

          {file ? (
            <div className="selected-file">
              <FileText size={17} />
              <span>{file.name}</span>
              <button
                className="text-button"
                type="button"
                onClick={() => actions.createOrder({ sample: false, file })}
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
            onClick={() => actions.createOrder({ sample: true })}
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
              <dd className="mono">{shorten(order.recipientAddress, 7)}</dd>
            </div>
          </dl>

          {order.status === "awaiting_payment" ||
          order.status === "payment_rejected" ? (
            pendingTxHash ? (
              <>
                <button
                  className="button button-primary button-wide"
                  type="button"
                  onClick={actions.continueVerification}
                  disabled={isPaying || isProcessing || isRestoring}
                >
                  {isPaying ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <RefreshCw size={17} />
                  )}
                  Continue verification
                </button>
                <div className="inline-alert inline-alert-info">
                  <AlertCircle size={16} />
                  A transaction was already submitted for this order. Resume
                  verification instead of paying again.
                </div>
              </>
            ) : !paymentTargetMatches ? (
              <div className="inline-alert inline-alert-error">
                <AlertCircle size={16} />
                This order was created for a different Arc network or receiving
                address. Start a new order before paying.
              </div>
            ) : paymentExpired ? (
              <div className="inline-alert inline-alert-error">
                <AlertCircle size={16} />
                This payment request expired after seven days. Start a new
                order to request a fresh payment.
              </div>
            ) : (
              <button
                className="button button-primary button-wide"
                type="button"
                onClick={actions.payWithArc}
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
            )
          ) : null}

          {(order.status === "failed" || order.status === "processing") &&
          order.paymentProof ? (
            <button
              className="button button-primary button-wide"
              type="button"
              onClick={() => actions.processOrder(order.id, order)}
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

          {order.status === "failed" ? (
            <a
              className="text-button"
              href={supportUrl}
              target="_blank"
              rel="noreferrer"
            >
              <AlertCircle size={14} />
              Open a payment support request
            </a>
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
              onClick={actions.copyMemo}
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
              onClick={actions.resetOrder}
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
  );
}
