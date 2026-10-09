import { Loader2, ReceiptText, ShieldCheck } from "lucide-react";
import type { SerializedOrder } from "@/lib/api/serialize";
import { orderStatusLabels } from "@/lib/domain/order";
import { QuoteResultView } from "@/components/quote-result";

export function ResultPanel({
  order,
  isProcessing,
}: {
  order: SerializedOrder | null;
  isProcessing: boolean;
}) {
  return (
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
            The document becomes available after the payment is final on Arc.
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
  );
}
