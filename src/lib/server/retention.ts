import {
  cleanupStaleOrders,
  redactExpiredResults,
} from "@/lib/server/repository";

const DAY_MS = 24 * 60 * 60_000;

export function getResultRetentionDays(
  env: Record<string, string | undefined> = process.env,
) {
  const parsed = Number.parseInt(env.ARCPROOF_RESULT_RETENTION_DAYS ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getRetentionExemptPublicIds(
  env: Record<string, string | undefined> = process.env,
) {
  return (env.ARCPROOF_RETENTION_EXEMPT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

// Runs alongside order creation: purge abandoned payment requests, then drop
// quotation payloads that outlived the configured retention window. Result
// redaction stays off until ARCPROOF_RESULT_RETENTION_DAYS is set.
export function runRetention() {
  const deletedOrders = cleanupStaleOrders();
  const retentionDays = getResultRetentionDays();
  const redactedPublicIds = retentionDays
    ? redactExpiredResults(
        retentionDays * DAY_MS,
        getRetentionExemptPublicIds(),
      )
    : [];

  return { deletedOrders, redactedPublicIds };
}
