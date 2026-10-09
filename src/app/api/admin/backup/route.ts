import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { logEvent } from "@/lib/server/logger";
import {
  backupLimiter,
  getClientKey,
  tooManyRequests,
} from "@/lib/server/rate-limit";
import {
  backupDatabase,
  resolveBackupPaths,
} from "@/lib/server/sqlite-backup";

export const runtime = "nodejs";
export const maxDuration = 120;

let backupInFlight = false;

function readBearerToken(request: Request) {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);

  return match?.[1]?.trim() ?? "";
}

function tokensMatch(expected: string, provided: string) {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

// Token-protected trigger for the online backup. The endpoint stays disabled
// until BACKUP_TOKEN is configured, so a deployment cannot expose it by
// accident, and an external scheduler can call it without shell access.
export async function POST(request: Request) {
  const expectedToken = process.env.BACKUP_TOKEN?.trim();

  if (!expectedToken) {
    return NextResponse.json(
      { error: "Backups are not enabled on this deployment." },
      { status: 503 },
    );
  }

  const rateLimit = backupLimiter.check(getClientKey(request));

  if (!rateLimit.allowed) {
    return tooManyRequests(
      rateLimit,
      "Too many backup requests. Try again shortly.",
    );
  }

  if (!tokensMatch(expectedToken, readBearerToken(request))) {
    logEvent("backup.unauthorized", { clientKey: getClientKey(request) });
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (backupInFlight) {
    return NextResponse.json(
      { error: "A backup is already running." },
      { status: 409 },
    );
  }

  backupInFlight = true;

  try {
    const paths = resolveBackupPaths();
    const result = backupDatabase(paths);
    const file = path.basename(result.target);

    logEvent("backup.completed", {
      file,
      orders: result.rows,
      pruned: result.pruned,
    });

    return NextResponse.json(
      {
        ok: true,
        backup: {
          file,
          orders: result.rows,
          pruned: result.pruned,
          keep: paths.keep,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    logEvent("backup.failed", {
      reason: error instanceof Error ? error.message : "Unknown error.",
    });
    return NextResponse.json(
      { error: "The backup could not be completed." },
      { status: 500 },
    );
  } finally {
    backupInFlight = false;
  }
}
