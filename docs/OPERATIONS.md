# Operations

## Deployment

- Run one Railway replica with a persistent volume mounted at `/data`.
- Set `ARCPROOF_DATA_DIR=/data` or use the Dockerfile default.
- Use `.railway/railway.ts` as the source of truth for Railway build and deployment settings.
- Run `railway config plan` before applying infrastructure changes, then run
  `railway config apply --yes`.
- Every variable the application reads is declared in the IaC file with `preserve()`. `railway config apply` does not remove variables on its own; deleting one additionally requires `--confirm-destructive`, so a stray apply cannot silently drop secrets such as `OPENAI_API_KEY`.
- Confirm `/api/health` returns `ok: true`, Chain ID `5042`, `live` payment mode, and `configured: true`.
- Keep browser-wallet private keys outside the application, repository, and environment variables.

## Backups

Back up the entire SQLite directory, including `arcproof.sqlite`, `arcproof.sqlite-wal`, and `arcproof.sqlite-shm` when present.

Use a SQLite-safe backup command or stop the service before copying the files. Do not restore a database while the service is running.

## Restore

1. Stop the Railway service.
2. Preserve the current volume copy.
3. Restore the database and any WAL files into `/data`.
4. Start the service.
5. Check `/api/health` and open one known public receipt.

## Monitoring

- Railway health checks use `/api/health`.
- `/api/health` returns a non-empty `configErrors` array when `ARC_NETWORK`, `ARC_PAYMENT_MODE`, `ARC_RECIPIENT_ADDRESS`, or `ARC_QUOTE_PRICE_USDC` is invalid. Treat a non-empty array as a failed deploy: payment creation is disabled while it is present.
- Application logs are JSON lines and contain public order identifiers, not quotation text.
- Alert on health failures, repeated payment-verification conflicts, and repeated processing failures.

## Incident handling

- If Arc RPC is unavailable, new verification requests remain recoverable; already verified orders retain their evidence.
- If processing fails, retry the order from the workbench without requesting another payment.
- If the browser closes after payment or processing begins, reopen the workbench to restore the local order reference, or use the public receipt's resume action.
- If a payment is verified but permanent processing remains impossible, use the payer and amount in the public receipt to handle a manual refund.
- Never edit transaction hashes or payment evidence directly in the database.
