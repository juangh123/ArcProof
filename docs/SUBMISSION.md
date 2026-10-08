# Arc Microgrants Submission

## Project

ArcProof

## Live deployment

https://arcproof-production.up.railway.app

## Repository

https://github.com/juangh123/ArcProof

## Builder profile

https://github.com/juangh123

## DoraHacks submission

https://dorahacks.io/buidl/49114

Status: Under review for Arc Microgrants. The signed-in event Builds page shows
`Your Build` -> `ArcProof` -> `Under Review`. The public Builds list and hub API
can remain at `count: 0` until DoraHacks approves the submission for public
display.

Optimized reviewer copy for the BUIDL description is maintained in
[DORAHACKS_BUIDL_DESCRIPTION.md](DORAHACKS_BUIDL_DESCRIPTION.md). The five-minute
review path is in [REVIEWER_GUIDE.md](REVIEWER_GUIDE.md).

## Short description

ArcProof turns supplier quotation documents into structured, validated line-item data. A customer uploads a quote, sees the fixed USDC price, pays through the Arc Memo contract, and receives the extraction result only after the server independently verifies the final Arc transaction.

The project is a working Arc Mainnet application, not a mockup. It includes a live Railway deployment, a persistent SQLite order store, browser-wallet payment recovery, public receipts, CSV export, automated verification, and real settlement evidence.

## What Arc is used for

Arc is the settlement and proof layer rather than a decorative wallet button.

ArcProof verifies:

- Chain ID `5042` and the final transaction receipt.
- The Memo identifier that binds the payment to one order.
- The nested USDC transfer recipient and amount.
- The applicable 18-decimal native USDC event.
- The 6-decimal ERC-20 event without double counting it.
- Unique transaction use, so one payment cannot fulfill multiple orders.

ArcProof also handles Arc's EIP-7708 self-transfer rule: when the payer and recipient are the same EOA, the protocol omits the native self-transfer log, so the verifier uses the signed Memo transfer plus the ERC-20 mirror while normal transfers still require both event representations.

The result is released only after final settlement. Arc's deterministic finality removes the usual multi-confirmation and reorg window from the fulfillment path.

## Mainnet proof

- Completed order: `AP-AC247758`
- Transaction: https://explorer.arc.io/tx/0x780b08710fa38e12d35a117918508d2bead4f3e6c88bab203e48dd501d36fe80
- Transaction hash: `0x780b08710fa38e12d35a117918508d2bead4f3e6c88bab203e48dd501d36fe80`
- Public receipt: https://arcproof-production.up.railway.app/proof/AP-AC247758
- CSV output: https://arcproof-production.up.railway.app/api/proof/AP-AC247758/csv
- Network: Arc Mainnet, Chain ID `5042`
- Settlement: `0.10 USDC`
- Payer / recipient: the same EOA (self-transfer self-test)
- Result: three structured quotation lines

This published payment is a self-test: the same EOA paid and received, which is Arc's documented EIP-7708 case where the protocol omits the native transfer event. The order is verified through the signed `Memo.memo` call plus the 6-decimal ERC-20 mirror. Normal payments from a separate payer additionally require the canonical 18-decimal native event. No separate-payer wallet payment was available for this submission.

![ArcProof completed Arc Mainnet receipt](assets/arcproof-proof-desktop.png)

## Verification

The repository contains:

- 54 passing unit and integration tests.
- 8 passing Playwright browser tests across desktop and a 390px mobile viewport.
- A production build verified in CI and in the Railway Docker build.
- `pnpm preflight` checks for RPC chain ID, deployed USDC and Memo contracts, recipient balance, public health, database writability, live payment mode, and the published service price.
- `pnpm smoke verify` checks a real transaction through the deployed verification and processing endpoints.

The public receipt records the final transaction, payer, recipient, Memo ID, block, payment amounts, and verification mode.

## Hardening since the initial submission

- The fixed `0.10 USDC` price is enforced in code and surfaced on `/api/health`, so a missing environment variable can no longer silently change the price.
- Documents are preflighted and rejected before payment when no structured line item can be produced. The validated draft is stored server-side and released only after the Arc payment is verified.
- Verification now claims an unpaid order atomically before Arc RPC work. Concurrent or stale verify requests can no longer downgrade an order that already recorded a payment, while failed jobs remain retryable without repaying.
- Legacy paid jobs that extract no line items fail retryably instead of releasing an empty result.
- CSV exports neutralize spreadsheet formulas, and the deterministic parser now handles space-aligned tables and European decimal amounts.
- Payment requests expire for new payments after seven days. Unpaid and payment-rejected records are retained server-side for up to 30 days, while orders that reached verification are retained for manual resolution.
- A submitted transaction is now locked as pending in the workbench, so a user can resume verification instead of paying the same order twice.
- Orders from a previous network or receiving address are rejected before the wallet is asked to sign, preventing a stale order from paying the wrong target.
- Public receipt recovery now uses the public order ID and a dedicated resume endpoint instead of exposing the internal order UUID.
- The optional extraction model default moved from the deprecated `gpt-5-mini` to the documented `gpt-5.6-terra`.

## Why it is worth continuing

Supplier quote normalization is a repeated, measurable workflow for small sourcing and e-commerce teams. ArcProof can begin as a paid document utility and evolve into a reusable payment, receipt, and fulfillment module for other document-heavy AI services.

## Current limitations

- EOA wallets only for the Memo payment path.
- One fixed price per quotation.
- Text-based PDF, TXT, and Markdown input only; scanned or image-only PDFs are not OCRed.
- Manual refund handling for permanent processing failures.

## Submission checklist

- [x] Live deployment on Arc Mainnet.
- [x] Public GitHub repository.
- [x] Public builder profile.
- [x] Completed real USDC payment and verification.
- [x] Public proof URL.
- [x] CSV output.
- [x] Automated tests and production deployment.
- [x] Arc Microgrants event submission confirmed: Builds page shows `Your Build`
  -> `ArcProof` -> `Under Review`.
- [x] Three-minute demo video attached to the DoraHacks BUIDL.
- [x] `v0.2.0` GitHub release published.
