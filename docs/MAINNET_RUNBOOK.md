# Arc Mainnet Runbook

## 1. Confirm the network

Arc Mainnet:

- Chain ID: `5042`
- RPC: `https://rpc.mainnet.arc.io`
- Explorer: `https://explorer.arc.io`

Do not confuse the mainnet chain ID with Arc Testnet `5042002`.

The public RPC is currently available at the default URL. Keep `ARC_RPC_URL` configurable in case the provider supplies a dedicated or private endpoint.

## 2. Prepare the receiving wallet

Use an EOA wallet that can:

- Receive USDC on Arc.
- Sign the Memo transaction.
- Remain available for manual refunds.

Set:

```text
ARC_NETWORK=mainnet
ARC_PAYMENT_MODE=live
ARC_RECIPIENT_ADDRESS=0x...
ARC_RPC_URL=https://rpc.mainnet.arc.io
ARC_EXPLORER_URL=https://explorer.arc.io
ARC_QUOTE_PRICE_USDC=0.10
ARCPROOF_DATA_DIR=/data
```

## 3. Obtain a small amount of USDC on Arc

Arc supports Circle CCTP and Gateway contracts for moving USDC. Availability of an exchange withdrawal route depends on the provider at the time of deployment.

Before the mainnet smoke test, complete a small transfer to the receiving wallet and verify the balance on Arc. For the first test, the same EOA may be used as payer and recipient with a `0.10 USDC` service price.

## 4. Test the real payment path

Use the sample quotation and pay the configured price from a funded EOA wallet.

Confirm:

- The wallet switches to chain `5042`.
- The transaction targets the Memo contract.
- The receipt shows exactly one canonical 18-decimal native USDC transfer.
- The receipt also shows one 6-decimal ERC-20 mirror for the same movement.
- The order reaches `completed`.
- The public proof page links to the transaction.
- Reusing the same transaction on another order is rejected.

## 5. Verify the production environment

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Check:

```text
GET /api/health
```

Expected values:

```json
{
  "ok": true,
  "network": "mainnet",
  "expectedChainId": 5042,
  "paymentMode": "live",
  "configured": true
}
```

## 6. Deployment requirements

- Node.js 24 runtime.
- Persistent storage mounted at `/data` for `arcproof.sqlite`.
- A single application instance while SQLite is in use.
- HTTPS.
- Environment variables configured in the hosting provider, not committed.
- No browser private keys and no server private key are required for the receiving path.

## 7. Submission evidence

Capture:

- Public deployment URL.
- Public repository URL.
- Builder profile URL.
- At least one completed order and transaction hash.
- One rejected underpayment or duplicate-payment attempt.
- Public proof page.
- CSV export.
