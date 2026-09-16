# Arc Microgrants Submission Draft

Replace all bracketed values before submitting.

## Project

ArcProof

## Live deployment

[PUBLIC_DEPLOYMENT_URL]

## Repository

[PUBLIC_REPOSITORY_URL]

## Builder profile

[GITHUB_X_OR_FARCASTER_URL]

## Short description

ArcProof turns supplier quotation documents into structured, validated line-item data. A customer uploads a quote, sees the fixed USDC price, pays through the Arc Memo contract, and receives the extraction result only after the server independently verifies the final Arc transaction.

## What Arc is used for

Arc is the settlement and proof layer rather than a decorative wallet button.

ArcProof verifies:

- Chain ID `5042` and the final transaction receipt.
- The Memo identifier that binds the payment to one order.
- The nested USDC transfer recipient and amount.
- The canonical 18-decimal native USDC event.
- The 6-decimal ERC-20 event without double counting it.
- Unique transaction use, so one payment cannot fulfill multiple orders.

The result is released immediately after final settlement because Arc provides deterministic finality.

## Mainnet proof

- Transaction: `[EXPLORER_TRANSACTION_URL]`
- Public receipt: `[PUBLIC_RECEIPT_URL]`
- Completed order: `[ORDER_ID]`

## Why it is worth continuing

Supplier quote normalization is a repeated, measurable workflow for small sourcing and e-commerce teams. ArcProof can begin as a paid document utility and evolve into a reusable payment, receipt, and fulfillment module for other document-heavy AI services.

## Current limitations

- EOA wallets only for the Memo payment path.
- One fixed price per quotation.
- PDF and text input only.
- Manual refund handling for permanent processing failures.
