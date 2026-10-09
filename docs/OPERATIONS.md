# Operations

## Deployment

- Run one Railway replica with a persistent volume mounted at `/data`.
- Set `ARCPROOF_DATA_DIR=/data` or use the Dockerfile default.
- Use `.railway/railway.ts` as the source of truth for Railway build and deployment settings.
- Run `railway config plan` before applying infrastructure changes, then run
  `railway config apply --yes`.
- On Windows, `railway config plan` can fail with `This version of railway/iac requires Railway CLI 5.42.1 or newer` because the IaC SDK resolves the CLI through `process.env._`. Run the IaC commands from WSL/Linux or use the Railway dashboard; code deployments with `railway up` are unaffected.
- Every variable the application reads is declared in the IaC file with `preserve()`. `railway config apply` does not remove variables on its own; deleting one additionally requires `--confirm-destructive`, so a stray apply cannot silently drop secrets such as `OPENAI_API_KEY`.
- Confirm `/api/health` returns `ok: true`, Chain ID `5042`, `live` payment mode, and `configured: true`.
- Keep browser-wallet private keys outside the application, repository, and environment variables.

## Backups

Backups run inside the application container with SQLite's `VACUUM INTO`, which is safe while the service keeps running. Two ways to trigger one:

1. Scheduled (recommended). Set `BACKUP_TOKEN` and call the protected endpoint from any external scheduler:

   ```bash
   curl -fsS -X POST https://<your-domain>/api/admin/backup \
     -H "Authorization: Bearer $BACKUP_TOKEN"
   # {"ok":true,"backup":{"file":"arcproof-...sqlite","orders":12,"pruned":[],"keep":7}}
   ```

   The endpoint returns `503` while `BACKUP_TOKEN` is unset, `401` for a wrong token, `409` while another backup is running and `500` when the snapshot fails. It is limited to six calls per hour per client and reports the copied row count.

2. Inside the container: `railway ssh --service ArcProof node /app/scripts/backup-sqlite.mjs`, or `pnpm backup` in a local checkout.

Both paths verify the copy with `PRAGMA integrity_check` and prune older files so only the newest `ARCPROOF_BACKUP_KEEP` (default 7) remain under `<ARCPROOF_DATA_DIR>/backups`; point `ARCPROOF_BACKUP_DIR` at another volume to keep them elsewhere.

For a raw copy instead, back up the entire SQLite directory including `arcproof.sqlite`, `arcproof.sqlite-wal`, and `arcproof.sqlite-shm`; stop the service before copying files that way. Do not restore a database while the service is running.

## Restore

1. Stop the Railway service.
2. Preserve the current volume copy.
3. Restore the database and any WAL files into `/data`.
4. Start the service.
5. Check `/api/health` and open one known public receipt.

## Monitoring

- Railway health checks use `/api/health`.
- The RPC chain check inside `/api/health` is cached for ten seconds; a provider outage therefore shows up after a short delay rather than on the first failed probe.
- `/api/health` returns a non-empty `configErrors` array when `ARC_NETWORK`, `ARC_PAYMENT_MODE`, `ARC_RECIPIENT_ADDRESS`, or `ARC_QUOTE_PRICE_USDC` is invalid. Treat a non-empty array as a failed deploy: payment creation is disabled while it is present.
- The `version` field reports `ARCPROOF_VERSION` first and `RAILWAY_GIT_COMMIT_SHA` second. A `railway up` deployment does not refresh the platform commit variable, so set `ARCPROOF_VERSION` to the deployed commit SHA when deploying that way.
- Application logs are JSON lines and contain public order identifiers, not quotation text.
- Alert on health failures, repeated payment-verification conflicts, and repeated processing failures.

## Retention

`ARCPROOF_RESULT_RETENTION_DAYS` (unset or `0` keeps results forever) redacts the stored quotation payload of completed orders older than the window. Payment evidence and the public receipt stay intact; the CSV export then answers `410 Gone`.

`ARCPROOF_RETENTION_EXEMPT_IDS` lists public ids that must never expire, for example the published demo receipt `AP-AC247758`. Retention runs alongside order creation, so it applies as traffic arrives rather than on a schedule.

Recommended starting point once the support/refund window is settled: `ARCPROOF_RESULT_RETENTION_DAYS=365` with the demo receipt exempted.

## Incident handling

- If Arc RPC is unavailable, new verification requests remain recoverable; already verified orders retain their evidence.
- If processing fails, retry the order from the workbench without requesting another payment.
- If the browser closes after payment or processing begins, reopen the workbench to restore the local order reference, or use the public receipt's resume action.
- If a payment is verified but permanent processing remains impossible, use the payer and amount in the public receipt to handle a manual refund.
- Never edit transaction hashes or payment evidence directly in the database.
