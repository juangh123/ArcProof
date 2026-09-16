# ArcProof

ArcProof turns supplier quotation documents into structured purchasing data and releases the result only after a final USDC payment is verified on Arc.

The project is built for freelancers, small sourcing teams, and agent workflows that need a complete payment-to-delivery loop without a separate indexer or reconciliation spreadsheet.

## Payment guarantees

The server independently verifies:

- Arc network and Chain ID `5042` in production.
- The `Memo.memo` call and its order identifier.
- The nested USDC `transfer` call, recipient, and amount.
- The canonical EIP-7708 native USDC event at 18 decimals.
- The ERC-20 USDC mirror event at 6 decimals, without counting it twice.
- A successful final transaction receipt.
- Unique transaction use across all orders.
- Atomic order binding, so concurrent submissions cannot replace the first verified transaction.

The frontend never grants fulfillment based on its own transaction success state.

## Product flow

```text
Document upload or sample
        |
        v
Order and random Arc memo created
        |
        v
Browser wallet calls Memo.memo(USDC.transfer(...))
        |
        v
Final Arc transaction verified by the server
        |
        v
Idempotent processing and CSV generation
        |
        v
Result plus public payment receipt
```

Failed extraction jobs can be retried without another payment. A processing lease also allows recovery after an interrupted server request.

## Stack

- Next.js 16 and React 19
- TypeScript
- Node.js 24
- Node's built-in SQLite (`node:sqlite`)
- Viem for Arc RPC, calldata encoding, and event verification
- `unpdf` for PDF text extraction
- Optional OpenAI model for structured extraction
- Playwright for desktop and mobile browser tests
- Railway with a persistent volume for the public deployment

## Local development

Requirements: Node.js 24 or newer and pnpm 12 or newer.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`.

The checked-in environment template uses Arc Testnet and fixture payment mode for a complete local demonstration without a wallet. Fixture mode is disabled in production and when `ARC_NETWORK=mainnet`.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `ARC_NETWORK` | Yes | `mainnet` or `testnet` |
| `ARC_PAYMENT_MODE` | No | `live` or non-production `fixture` |
| `ARC_RECIPIENT_ADDRESS` | Yes | Wallet receiving the USDC payment |
| `ARC_RPC_URL` | No | Override the default Arc RPC endpoint |
| `ARC_EXPLORER_URL` | No | Override the default explorer |
| `ARC_QUOTE_PRICE_USDC` | No | Fixed service price, default `0.10` |
| `OPENAI_API_KEY` | No | Enables model extraction |
| `OPENAI_MODEL` | No | Model name, default `gpt-5-mini` |
| `ARCPROOF_DATA_DIR` | No | SQLite directory, default `./data` |
| `ARCPROOF_DATABASE_PATH` | No | Full SQLite file path override |

Production environment:

```text
ARC_NETWORK=mainnet
ARC_PAYMENT_MODE=live
ARC_RECIPIENT_ADDRESS=<Arc mainnet EOA>
ARC_QUOTE_PRICE_USDC=0.10
ARCPROOF_DATA_DIR=/data
```

## Arc network parameters

| Network | Chain ID | USDC interface | Memo contract |
|---|---:|---|---|
| Arc Mainnet | `5042` | `0x3600000000000000000000000000000000000000` | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` |
| Arc Testnet | `5042002` | `0x3600000000000000000000000000000000000000` | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` |

The canonical native USDC emitter is `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` and uses 18 decimals. The ERC-20 interface emits a 6-decimal mirror event.

Only EOA wallets are supported by the initial Memo-based payment path. ERC-4337, Safe, and other smart contract wallets are intentionally out of scope for this version.

## Deployment

The repository includes a Node.js 24 Dockerfile and `railway.toml`.

1. Create a Railway service from this repository.
2. Add a persistent volume mounted at `/data`.
3. Keep the service at one replica because SQLite is single-instance storage.
4. Set the production environment variables listed above.
5. Wait for `/api/health` to return `ok: true`, Chain ID `5042`, and `configured: true`.

The Railway-generated HTTPS URL is sufficient for the live deployment link.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Before a mainnet deployment, run:

```bash
ARC_NETWORK=mainnet \
ARC_RECIPIENT_ADDRESS=0x... \
PUBLIC_BASE_URL=https://your-railway-domain \
pnpm preflight
```

PowerShell users can set the same values with `$env:ARC_NETWORK`, `$env:ARC_RECIPIENT_ADDRESS`, and `$env:PUBLIC_BASE_URL`.

Create a public smoke-test order after deployment:

```bash
PUBLIC_BASE_URL=https://your-railway-domain pnpm smoke create
```

After paying in the browser wallet, verify and process the transaction:

```bash
PUBLIC_BASE_URL=https://your-railway-domain \
pnpm smoke verify <ORDER_ID> <TRANSACTION_HASH>
```

The unit suite covers payment transaction uniqueness, failed-job retry, processing lease recovery, stale-order cleanup, rate limiting, file validation, the two-event Arc USDC model, quotation extraction, and monetary consistency.

The browser suite covers the complete sample flow and public receipt on desktop and a 390px mobile viewport.

## Privacy and limits

- Uploaded source files are not stored.
- Extracted source text is removed after successful processing.
- The public proof page exposes payment facts and aggregate result metadata only.
- The service does not provide custody, exchange, tax advice, or accounting services.
- The first version uses one fixed price, one application instance, and EOA wallets only.
- Permanent processing failures require a manual refund process before production use.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Mainnet runbook](docs/MAINNET_RUNBOOK.md)
- [Operations](docs/OPERATIONS.md)
- [Submission draft](docs/SUBMISSION.md)
