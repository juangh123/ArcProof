# ArcProof

![ArcProof Mainnet proof](https://raw.githubusercontent.com/juangh123/ArcProof/master/docs/assets/arcproof-cover.png)

## The problem

Supplier quotations still arrive as PDFs, email bodies, and inconsistent
tables. Small sourcing teams copy the same line items into spreadsheets by
hand, then reconcile payment separately from delivery.

## What ArcProof does

ArcProof turns a supplier quotation into validated, structured purchasing
data. A customer uploads a PDF or text quotation, sees a fixed `0.10 USDC`
price, pays through the Arc `Memo` contract, and receives the result only
after the server independently verifies final settlement on Arc Mainnet.

Every completed order also gets a public payment receipt and CSV export.

## Live Mainnet proof

- Live app: https://arcproof-production.up.railway.app
- Completed order: https://arcproof-production.up.railway.app/proof/AP-AC247758
- CSV result: https://arcproof-production.up.railway.app/api/proof/AP-AC247758/csv
- Transaction: https://explorer.arc.io/tx/0x780b08710fa38e12d35a117918508d2bead4f3e6c88bab203e48dd501d36fe80
- Repo: https://github.com/juangh123/ArcProof

The recorded order settled `0.10 USDC` on Arc Mainnet and returned three
structured quotation lines. This is a real Mainnet payment, not a fixture or
a testnet-only demo.

## Why Arc is essential

Arc is the settlement and proof layer, not a decorative wallet button.
ArcProof verifies:

- Arc Mainnet Chain ID `5042` and the final transaction receipt.
- The `Memo.memo` call, order-specific `memoId`, and calldata hash.
- The nested USDC transfer recipient and exact amount.
- The applicable 18-decimal native USDC event and the 6-decimal ERC-20 mirror,
  without double counting them.
- The documented EIP-7708 self-transfer exception where the native event is
  omitted.
- Transaction uniqueness across orders, so one payment cannot fulfill two
  orders.
- Atomic order binding, so concurrent verification attempts cannot replace the
  first verified transaction.

The result is released only after final settlement. The frontend never grants
fulfillment from its own transaction-success state.

## Engineering quality

- Next.js 16, React 19, TypeScript, Node.js 24, SQLite, viem, and unpdf.
- 50 unit/integration tests and 8 Playwright tests across desktop and a 390px
  mobile viewport.
- Green CI pipeline with lint, typecheck, unit tests, production build, Docker
  build, and browser tests.
- Production Docker image deployed on Railway with a persistent SQLite volume.
- Pre-payment document validation, server-side draft storage, pending-payment
  locking, seven-day payment expiry, bounded rate limiting, and upload-size
  preflight.
- Public receipt recovery by public order ID without exposing the internal
  order UUID.

## What is live today

A customer can upload a supported quotation, receive validated extraction
without paying for garbage input, pay `0.10 USDC` through the Arc Memo
contract, and get a structured result plus a public receipt and CSV.

## Current limits

- EOA wallets only for the Memo payment path.
- One fixed price per quotation.
- Text-based PDF, TXT, and Markdown input only; scanned PDFs are not OCRed.
- Permanent processing failures use a manual refund review.

## Why it is worth continuing

Supplier quote normalization is a repeated, measurable workflow for small
sourcing and e-commerce teams. ArcProof can begin as a paid document utility
and evolve into a reusable payment, receipt, and fulfillment module for other
document-heavy AI services.
