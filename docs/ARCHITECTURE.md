# Architecture

## Request flow

```text
Document upload or sample
        |
        v
Preflight extraction and validation
        |
        v
Order service creates a random payment memo
        |
        v
Browser wallet calls Memo.memo(USDC.transfer(...))
        |
        v
Arc final transaction receipt
        |
        v
Server verifier independently checks the payment
        |
        v
Idempotent processing claim
        |
        v
AI or deterministic extraction
        |
        v
CSV, result view, and public receipt
```

## Core modules

`src/lib/arc/config.ts`

Network parameters, deployed contract addresses, environment parsing, and public configuration.

`src/lib/arc/abi.ts`

Memo encoding and the transfer event ABI used for verification.

`src/lib/arc/events.ts`

Classifies native and ERC-20 USDC transfer logs. The native 18-decimal event is the effective ledger entry; the 6-decimal ERC-20 event is retained as a mirror and never counted twice.

`src/lib/arc/verifier.ts`

Validates the final transaction, Memo binding, nested transfer, recipient, amount, and the applicable event representations. EIP-7708 omits the native self-transfer log, so that case uses the ERC-20 mirror without weakening normal-transfer checks.

`src/lib/server/repository.ts`

SQLite-backed order state, unique transaction binding, and idempotent processing claims.

`src/lib/server/order-processing.ts`

Shared fulfillment pipeline used by the private process route and the public resume route: processing claim, lease and retry-limit enforcement, extraction fallback, completion, and failure recording.

`src/lib/server/extract.ts`

PDF/text ingestion, optional model extraction, deterministic fallback, pre-payment validation, and output validation.

`src/lib/api/order-client.ts`

Browser-side order API client: create/read/verify/process requests, typed request errors, and the local storage handle used to resume an active order.

`src/components/workbench.tsx`

Workbench composition root. The order state machine lives in `src/components/use-workbench-order.ts`, the intake and result sections render from `src/components/workbench/intake-panel.tsx` and `src/components/workbench/result-panel.tsx`.

## Order state

```text
awaiting_payment
    |
    +--> verifying --> payment_verified --> processing --> completed
    |                      |
    |                      +--> failed
    |
    +--> payment_rejected
```

`processing` is claimed with a conditional SQL update that increments an attempt number. Repeating the processing request cannot start a second fulfillment once the order has moved to `processing` or `completed`. A failed job can be claimed again without another payment, and a processing job can be reclaimed after its five-minute lease expires. Completion and failure updates are fenced by the attempt number, so an expired worker cannot overwrite the result of a newer claim.

## Reliability rules

- A transaction hash has a database-level unique constraint across all orders.
- Payment recording uses a conditional update, so the first verified transaction wins.
- Verification refuses orders that were created for a different Arc network or chain than the running deployment.
- Configuration is validated per request. Invalid values are reported through `/api/health` as `configErrors` and block payment creation instead of silently falling back to a real-money network or a default price.
- A document must produce at least one validated line item before an order or payment request is created. The draft remains hidden until payment verification succeeds.
- Order creation enforces a hard request-body ceiling by counting streamed bytes, so chunked uploads without a `Content-Length` header cannot bypass the 8 MB limit.
- PDFs are inspected for page count before text extraction and rejected above 50 pages.
- A failed processing job remains linked to its verified payment and can be retried without repaying.
- Processing retries are capped at five attempts per order, after which the order needs manual support.
- The browser stores the active order identifier and any pending transaction hash locally, so a reload can resume verification and processing without creating a second payment.
- A public receipt exposes a resume-processing action for verified orders whose fulfillment was interrupted.
- Public receipt identifiers use eight random bytes so they cannot be guessed in bulk.
- Payment requests expire for new payments after seven days; the browser enforces that window. The server still verifies a payment that already exists on Arc, then keeps the order for manual resolution. Unpaid and payment-rejected records are retained server-side for up to 30 days; orders that reached verification are never deleted automatically because a transaction may already exist on Arc.
- Order creation is limited to ten requests per client in a ten-minute window per application instance. Verification and processing requests are rate limited per client as well.
- A job that finds no line items is kept as a retryable failure instead of releasing an empty paid result.

## Why Arc matters

Arc provides:

- USDC as the native gas token.
- Deterministic finality in under one second.
- A final receipt with no reorg window.
- Native USDC and an ERC-20 interface that share one balance but emit different precision representations.
- The Memo predeploy for order references.

ArcProof uses these properties to release a paid result immediately and to create a compact, auditable payment receipt. Replacing Arc with a conventional EVM chain would require a different confirmation model and would lose the canonical native USDC event used by the verifier. EIP-7708 omits native self-transfer logs, so self-payments are verified against the ERC-20 mirror and the signed Memo transfer while normal payments still require both representations.

## Current limits

- SQLite is intended for one application instance with a persistent disk mounted at `/data`.
- The payment path supports EOA wallets only.
- One fixed price is used for every quotation.
- There are no user accounts or organization-level permissions.
- The model provider is optional. The deterministic parser remains available for supported layouts.
