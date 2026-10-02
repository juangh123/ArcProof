import Link from "next/link";
import { Blocks, Code, FileCheck2, ReceiptText, Table2 } from "lucide-react";
import { Workbench } from "@/components/workbench";
import { getPublicArcConfig } from "@/lib/arc/config";

export const dynamic = "force-dynamic";

export default function Home() {
  const config = getPublicArcConfig();
  const reviewProofId =
    process.env.NEXT_PUBLIC_REVIEW_PROOF_ID?.trim() || "AP-AC247758";

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
          <div className="header-meta">
            <span className="header-chain">
              <Blocks size={15} />
              Chain {config.chainId}
            </span>
            <span
              className={
                config.paymentMode === "fixture"
                  ? "environment-pill environment-fixture"
                  : "environment-pill"
              }
            >
              {config.paymentMode === "fixture"
                ? "Fixture mode"
                : config.configured
                  ? "Live settlement"
                  : "Needs configuration"}
            </span>
          </div>
        </div>
      </header>

      <main className="page-shell">
        <div className="page-heading">
          <div>
            <div className="eyebrow">Supplier quote intake</div>
            <h1>Turn quotation documents into structured purchasing data.</h1>
          </div>
          <p>
            USDC settlement is verified directly from final Arc events before
            the extraction result is released.
          </p>
        </div>

        <Workbench config={config} />

        <nav className="reviewer-path" aria-label="Submission review links">
          <a
            href={`/proof/${reviewProofId}`}
            target="_blank"
            rel="noreferrer"
          >
            <ReceiptText size={15} />
            Completed Arc Mainnet receipt
          </a>
          <a href={`/api/proof/${reviewProofId}/csv`}>
            <Table2 size={15} />
            CSV result
          </a>
          <a
            href="https://github.com/juangh123/ArcProof"
            target="_blank"
            rel="noreferrer"
          >
            <Code size={15} />
            Source and tests
          </a>
        </nav>
      </main>
    </div>
  );
}
