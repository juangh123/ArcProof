#!/usr/bin/env node
// Online SQLite backup: VACUUM INTO takes a consistent snapshot while the
// service keeps running, then the copy is verified and old files are pruned.
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

export const DEFAULT_BACKUP_KEEP = 7;
const BACKUP_FILE_PATTERN = /^arcproof-.*\.sqlite$/;

export function resolveBackupPaths(env = process.env) {
  const dataDirectory =
    env.ARCPROOF_DATA_DIR?.trim() || path.join(process.cwd(), "data");
  const parsedKeep = Number.parseInt(env.ARCPROOF_BACKUP_KEEP ?? "", 10);

  return {
    databasePath:
      env.ARCPROOF_DATABASE_PATH?.trim() ||
      path.join(dataDirectory, "arcproof.sqlite"),
    backupDirectory:
      env.ARCPROOF_BACKUP_DIR?.trim() ||
      path.join(dataDirectory, "backups"),
    keep:
      Number.isFinite(parsedKeep) && parsedKeep > 0
        ? parsedKeep
        : DEFAULT_BACKUP_KEEP,
  };
}

export function backupStamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function pruneBackups(backupDirectory, keep) {
  const names = readdirSync(backupDirectory)
    .filter((name) => BACKUP_FILE_PATTERN.test(name))
    .sort();
  const excess = names.slice(0, Math.max(0, names.length - keep));

  for (const name of excess) {
    rmSync(path.join(backupDirectory, name), { force: true });
  }

  return excess;
}

export function backupDatabase(
  { databasePath, backupDirectory, keep = DEFAULT_BACKUP_KEEP },
  now = new Date(),
) {
  if (!existsSync(databasePath)) {
    throw new Error(`The database does not exist: ${databasePath}`);
  }

  mkdirSync(backupDirectory, { recursive: true });
  const target = path.join(
    backupDirectory,
    `arcproof-${backupStamp(now)}.sqlite`,
  );
  const database = new DatabaseSync(databasePath);

  try {
    database.exec("PRAGMA busy_timeout = 10000;");
    // VACUUM INTO rejects a bound parameter, so inline the escaped literal.
    database.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  } finally {
    database.close();
  }

  const copy = new DatabaseSync(target, { readOnly: true });
  let rows = null;

  try {
    const integrity = copy.prepare("PRAGMA integrity_check").get();
    const result = integrity ? Object.values(integrity)[0] : null;

    if (result !== "ok") {
      throw new Error(
        `Backup integrity check failed: ${JSON.stringify(integrity)}`,
      );
    }

    const row = copy.prepare("SELECT COUNT(*) AS orders FROM orders").get();
    rows = row ? Number(row.orders) : null;
  } finally {
    copy.close();
  }

  return { target, rows, pruned: pruneBackups(backupDirectory, keep) };
}

function main() {
  const paths = resolveBackupPaths();
  const { target, rows, pruned } = backupDatabase(paths);

  console.log(
    JSON.stringify({
      event: "backup.completed",
      target,
      orders: rows,
      pruned,
      keep: paths.keep,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "backup.failed",
        reason: error instanceof Error ? error.message : "Unknown error.",
      }),
    );
    process.exit(1);
  }
}
