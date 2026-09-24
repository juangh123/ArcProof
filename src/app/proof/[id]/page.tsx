import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Blocks,
  CheckCircle2,
  Clock3,
  FileCheck2,
  ShieldCheck,
} from "lucide-react";
import { getOrderByPublicId, getOrderEvents } from "@/lib/server/repository";
import { orderStatusLabels } from "@/lib/domain/order";
import { getPublicArcConfig } from "@/lib/arc/config";
import { ResumeProcessing } from "@/components/resume-processing";

export const dynamic = "force-dynamic";

function timestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default async function ProofPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = getOrderByPublicId(id);

  if (!order) {
    notFound();
  }

  const config = getPublicArcConfig();
  const proof = order.paymentProof;
  const events = getOrderEvents(order.id);
  const explorerTransaction = order.txHash
    ? `${config.explorerUrl}/tx/${order.txHash}`
    : null;

  return (
    <div className="app-frame">
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href="/">
            <span className="brand-mark">
              <FileCheck2 size={18} />
            </span>
            <span>ArcProof</span>
          </Link>
          <span className="header-chain">
            <Blocks size={15} />
            {config.name}
          </span>
        </div>
      </header>

      <main className="proof-shell">
        <Link className="back-link" href="/">
          <ArrowLeft size={15} />
          Workbench
        </Link>

        <section className="proof-panel">
          <div className="proof-header">
            <div>
              <div className="eyebrow">Order receipt</div>
              <h1>{order.publicId}</h1>
              <p>Created {timestamp(order.createdAt)} UTC</p>
            </div>
            <span
              className={
                proof
                  ? "status-pill status-positive"
                  : order.status === "failed" ||
                      order.status === "payment_rejected"
                    ? "status-pill status-negative"
                    : "status-pill"
              }
            >
              {proof ? <ShieldCheck size={14} /> : <Clock3 size={14} />}
              {orderStatusLabels[order.status]}
            </span>
          </div>

          <div className="proof-summary">
            <div>
              <span>Amount</span>
              <strong>{order.amountDisplay} USDC</strong>
            </div>
            <div>
              <span>Network</span>
              <strong>{config.name}</strong>
            </div>
            <div>
              <span>Chain ID</span>
              <strong>{order.chainId}</strong>
            </div>
            <div>
              <span>Extraction</span>
              <strong>{order.quoteResult?.lineItems.length ?? 0} lines</strong>
            </div>
          </div>

          {!proof ? (
            <div className="proof-pending">
              <Clock3 size={28} />
              <div>
                <strong>Payment not verified</strong>
                <p>
                  This receipt will show canonical payment evidence after the
                  server verifies the final Arc transaction.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="proof-verified">
                <CheckCircle2 size={24} />
                <div>
                  <strong>Canonical payment verified</strong>
                  <p>
                    Memo binding, recipient, amount, and the applicable Arc
                    USDC event representations were checked.
                  </p>
                </div>
              </div>

              <dl className="receipt-grid">
                <div>
                  <dt>Transaction</dt>
                  <dd className="mono">
                    {explorerTransaction ? (
                      <a
                        href={explorerTransaction}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {order.txHash}
                      </a>
                    ) : (
                      order.txHash
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Payer</dt>
                  <dd className="mono">{proof.payerAddress}</dd>
                </div>
                <div>
                  <dt>Recipient</dt>
                  <dd className="mono">{proof.recipientAddress}</dd>
                </div>
                <div>
                  <dt>Memo ID</dt>
                  <dd className="mono">{proof.memoId}</dd>
                </div>
                <div>
                  <dt>Block</dt>
                  <dd className="mono">{proof.blockNumber}</dd>
                </div>
                <div>
                  <dt>Verification</dt>
                  <dd>{proof.verificationMode}</dd>
                </div>
                <div>
                  <dt>Native event</dt>
                  <dd>
                    {proof.nativeEventOmitted
                      ? "Omitted for self-transfer (EIP-7708)"
                      : `${proof.amountNativeAtomic} · 18 decimals`}
                  </dd>
                </div>
                <div>
                  <dt>ERC-20 event</dt>
                  <dd>{proof.amountErc20Atomic} · 6 decimals</dd>
                </div>
              </dl>
            </>
          )}

          <ResumeProcessing orderId={order.id} status={order.status} />

          <div className="event-section">
            <div className="section-title">
              <h2>Verification events</h2>
              <span>{events.length} records</span>
            </div>
            <ol className="event-list">
              {events.map((event) => (
                <li key={event.id}>
                  <span className="event-marker" />
                  <div>
                    <strong>{event.type}</strong>
                    <time>{timestamp(event.createdAt)} UTC</time>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
    </div>
  );
}
