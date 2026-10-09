// Shared online-backup core. It only imports Node built-ins so both the
// Next.js route and the standalone CLI script can use it.
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const DEFAULT_BACKUP_KEEP = 7;
const BACKUP_FILE_PATTERN = /^arcproof-.*\.sqlite$/;

export type BackupPaths = {
  databasePath: string;
  backupDirectory: string;
  keep: number;
};

export type BackupResult = {
  target: string;
  rows: number | null;
  pruned: string[];
};

export function resolveBackupPaths(
  env: NodeJS.ProcessEnv = process.env,
): BackupPaths {
  const dataDirectory =
    env.ARCPROOF_DATA_DIR?.trim() || path.join(process.cwd(), "data");
  const parsedKeep = Number.parseInt(env.ARCPROOF_BACKUP_KEEP ?? "", 10);

  return {
    databasePath:
      env.ARCPROOF_DATABASE_PATH?.trim() ||
      path.join(dataDirectory, "arcproof.sqlite"),
    backupDirectory:
      env.ARCPROOF_BACKUP_DIR?.trim() || path.join(dataDirectory, "backups"),
    keep:
      Number.isFinite(parsedKeep) && parsedKeep > 0
        ? parsedKeep
        : DEFAULT_BACKUP_KEEP,
  };
}

export function backupStamp(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function pruneBackups(backupDirectory: string, keep: number) {
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
  { databasePath, backupDirectory, keep = DEFAULT_BACKUP_KEEP }: BackupPaths,
  now = new Date(),
): BackupResult {
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
  let rows: number | null = null;

  try {
    const integrity = copy.prepare("PRAGMA integrity_check").get() as
      | Record<string, unknown>
      | undefined;
    const result = integrity ? Object.values(integrity)[0] : null;

    if (result !== "ok") {
      throw new Error(
        `Backup integrity check failed: ${JSON.stringify(integrity)}`,
      );
    }

    const row = copy
      .prepare("SELECT COUNT(*) AS orders FROM orders")
      .get() as { orders: number } | undefined;
    rows = row ? Number(row.orders) : null;
  } finally {
    copy.close();
  }

  return { target, rows, pruned: pruneBackups(backupDirectory, keep) };
}
