# Five-Minute Reviewer Guide

## 1. Confirm the deployment

Open:

https://arcproof-production.up.railway.app/api/health

Check `ok: true`, `network: mainnet`, `expectedChainId: 5042`,
`paymentMode: live`, `quotePriceUsdc: "0.10"`, and the deployed commit version.

## 2. Inspect the completed Mainnet receipt

Open:

https://arcproof-production.up.railway.app/proof/AP-AC247758

Verify:

- Status `Completed`.
- Amount `0.10 USDC` on Arc Mainnet, Chain ID `5042`.
- Payer, recipient, Memo ID, block, and transaction hash.
- Native/ERC-20 event handling, including the EIP-7708 self-transfer entry.
- The transaction link and the five verification events.

## 3. Download the structured result

Open:

https://arcproof-production.up.railway.app/api/proof/AP-AC247758/csv

The CSV contains the three structured quotation lines produced for the paid
order.

## 4. Verify the transaction independently

Open the transaction in the Arc explorer:

https://explorer.arc.io/tx/0x780b08710fa38e12d35a117918508d2bead4f3e6c88bab203e48dd501d36fe80

The recorded transaction is also independently checked by `pnpm preflight`
against the configured Arc Mainnet RPC.

## 5. Review the engineering

Open the repository:

https://github.com/juangh123/ArcProof

Useful entry points:

- `src/lib/arc/verifier.ts` for Memo, calldata, recipient, amount, and event
  verification.
- `src/lib/server/repository.ts` for transaction uniqueness, processing
  leases, expiry, and retention.
- `src/components/workbench.tsx` for the browser payment and recovery flow.
- `docs/ARCHITECTURE.md` for the end-to-end request flow.
- `docs/MAINNET_RUNBOOK.md` for the deployment and smoke-test process.

## 6. Check quality gates

- CI: https://github.com/juangh123/ArcProof/actions
- Release: https://github.com/juangh123/ArcProof/releases/tag/v0.2.0
- Local commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
  `pnpm test:e2e`

## 7. Understand the boundaries

The first version intentionally supports EOA wallets, one fixed price, and
text-based PDF/TXT/Markdown input. Scanned PDFs are rejected rather than OCRed,
and permanent processing failures use a manual refund review. These limits are
documented rather than hidden.
