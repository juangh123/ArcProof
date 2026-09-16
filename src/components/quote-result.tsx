import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
} from "lucide-react";
import type { SerializedOrder } from "@/lib/api/serialize";

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function QuoteResultView({
  order,
}: {
  order: SerializedOrder;
}) {
  const quote = order.quoteResult;

  if (!quote) {
    return (
      <div className="empty-state">
        <FileText size={26} strokeWidth={1.7} />
        <strong>No structured result yet</strong>
        <span>
          The result is generated only after the Arc payment is verified.
        </span>
      </div>
    );
  }

  const confidence = Math.round(quote.confidence * 100);

  return (
    <div className="result-stack">
      <div className="result-heading">
        <div>
          <div className="eyebrow">Supplier</div>
          <h2>{quote.supplier}</h2>
          <p>
            {quote.quoteNumber || "No quote number"}
            {quote.issuedDate ? ` · ${quote.issuedDate}` : ""}
          </p>
        </div>
        <a
          className="button button-secondary"
          href={`/api/orders/${order.id}/csv`}
        >
          <Download size={16} />
          CSV
        </a>
      </div>

      <div className="metric-row">
        <div>
          <span>Line items</span>
          <strong>{quote.lineItems.length}</strong>
        </div>
        <div>
          <span>Document total</span>
          <strong>{formatMoney(quote.total, quote.currency)}</strong>
        </div>
        <div>
          <span>Extraction</span>
          <strong>{quote.extractionMode === "ai" ? "AI model" : "Rules"}</strong>
        </div>
        <div>
          <span>Confidence</span>
          <strong>{confidence}%</strong>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>SKU</th>
              <th>Description</th>
              <th className="numeric">Qty</th>
              <th>Unit</th>
              <th className="numeric">Unit price</th>
              <th className="numeric">Line total</th>
            </tr>
          </thead>
          <tbody>
            {quote.lineItems.map((item) => (
              <tr key={`${item.lineNumber}-${item.sku}`}>
                <td>{item.lineNumber}</td>
                <td className="mono">{item.sku || "—"}</td>
                <td>{item.description}</td>
                <td className="numeric">{item.quantity}</td>
                <td>{item.unit || "—"}</td>
                <td className="numeric">
                  {formatMoney(item.unitPrice, quote.currency)}
                </td>
                <td className="numeric">
                  {formatMoney(item.lineTotal, quote.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="totals-line">
        <span>Subtotal {formatMoney(quote.subtotal, quote.currency)}</span>
        <span>Tax {formatMoney(quote.tax, quote.currency)}</span>
        <strong>Total {formatMoney(quote.total, quote.currency)}</strong>
      </div>

      <div className="validation-block">
        <div className="section-title">
          {quote.validationIssues.length === 0 ? (
            <CheckCircle2 size={17} />
          ) : (
            <AlertTriangle size={17} />
          )}
          <h3>Validation</h3>
          <span>{quote.validationIssues.length} findings</span>
        </div>

        {quote.validationIssues.length === 0 ? (
          <p className="validation-ok">
            Line totals, subtotal, tax, and total are internally consistent.
          </p>
        ) : (
          <ul className="issue-list">
            {quote.validationIssues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>
                <span
                  className={
                    issue.severity === "error"
                      ? "issue-dot issue-dot-error"
                      : "issue-dot"
                  }
                />
                <div>
                  <strong>{issue.code}</strong>
                  <p>{issue.message}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

