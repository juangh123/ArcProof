# Architecture

## Request flow

```text
Document upload or sample
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

Validates the final transaction, Memo binding, nested transfer, recipient, amount, and both event representations.

`src/lib/server/repository.ts`

SQLite-backed order state, unique transaction binding, and idempotent processing claims.

`src/lib/server/extract.ts`

PDF/text ingestion, optional model extraction, deterministic fallback, and output validation.

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

`processing` is claimed with a conditional SQL update. Repeating the processing request cannot start a second fulfillment once the order has moved to `processing` or `completed`. A failed job can be claimed again without another payment, and a processing job can be reclaimed after its five-minute lease expires.

## Reliability rules

- A transaction hash has a database-level unique constraint across all orders.
- Payment recording uses a conditional update, so the first verified transaction wins.
- A failed processing job remains linked to its verified payment and can be retried without repaying.
- Unpaid orders older than 24 hours are removed during new order creation.
- Order creation is limited to ten requests per client in a ten-minute window per application instance.

## Why Arc matters

Arc provides:

- USDC as the native gas token.
- Deterministic finality in under one second.
- A final receipt with no reorg window.
- Native USDC and an ERC-20 interface that share one balance but emit different precision representations.
- The Memo predeploy for order references.

ArcProof uses these properties to release a paid result immediately and to create a compact, auditable payment receipt. Replacing Arc with a conventional EVM chain would require a different confirmation model and would lose the canonical native USDC event used by the verifier.

## Current limits

- SQLite is intended for one application instance with a persistent disk mounted at `/data`.
- The payment path supports EOA wallets only.
- One fixed price is used for every quotation.
- There are no user accounts or organization-level permissions.
- The model provider is optional. The deterministic parser remains available for supported layouts.
