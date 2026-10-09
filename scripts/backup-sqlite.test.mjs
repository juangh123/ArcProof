import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  backupDatabase,
  pruneBackups,
  resolveBackupPaths,
} from "./backup-sqlite.mjs";

let directories = [];

function createDatabase(directory) {
  const databasePath = path.join(directory, "arcproof.sqlite");
  const database = new DatabaseSync(databasePath);

  database.exec(
    "CREATE TABLE orders (id TEXT PRIMARY KEY, status TEXT NOT NULL)",
  );
  database
    .prepare("INSERT INTO orders (id, status) VALUES (?, ?)")
    .run("order-1", "completed");
  database.close();

  return databasePath;
}

function tempDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "arcproof-backup-"));

  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories) {
    rmSync(directory, { recursive: true, force: true });
  }

  directories = [];
});

describe("resolveBackupPaths", () => {
  it("derives the backup directory, database path and retention from the environment", () => {
    expect(
      resolveBackupPaths({
        ARCPROOF_DATA_DIR: "/data",
        ARCPROOF_BACKUP_KEEP: "3",
      }),
    ).toEqual({
      databasePath: path.join("/data", "arcproof.sqlite"),
      backupDirectory: path.join("/data", "backups"),
      keep: 3,
    });
  });

  it("falls back to the default retention when the value is unusable", () => {
    expect(resolveBackupPaths({ ARCPROOF_BACKUP_KEEP: "zero" }).keep).toBe(7);
    expect(resolveBackupPaths({ ARCPROOF_BACKUP_KEEP: "-2" }).keep).toBe(7);
  });
});

describe("backupDatabase", () => {
  it("writes a readable copy of the live database", () => {
    const directory = tempDirectory();
    const databasePath = createDatabase(directory);
    const backupDirectory = path.join(directory, "backups");

    const { target, rows, pruned } = backupDatabase(
      { databasePath, backupDirectory, keep: 7 },
      new Date("2026-10-10T01:00:00.000Z"),
    );

    expect(path.basename(target)).toBe(
      "arcproof-2026-10-10T01-00-00-000Z.sqlite",
    );
    expect(rows).toBe(1);
    expect(pruned).toEqual([]);

    const copy = new DatabaseSync(target, { readOnly: true });
    const row = copy
      .prepare("SELECT status FROM orders WHERE id = ?")
      .get("order-1");
    copy.close();

    expect(row.status).toBe("completed");
  });

  it("keeps only the newest backups", () => {
    const directory = tempDirectory();
    const databasePath = createDatabase(directory);
    const backupDirectory = path.join(directory, "backups");
    const options = { databasePath, backupDirectory, keep: 2 };

    backupDatabase(options, new Date("2026-10-10T01:00:00.000Z"));
    backupDatabase(options, new Date("2026-10-10T02:00:00.000Z"));
    const third = backupDatabase(
      options,
      new Date("2026-10-10T03:00:00.000Z"),
    );

    expect(third.pruned).toEqual([
      "arcproof-2026-10-10T01-00-00-000Z.sqlite",
    ]);
    expect(readdirSync(backupDirectory).sort()).toEqual([
      "arcproof-2026-10-10T02-00-00-000Z.sqlite",
      "arcproof-2026-10-10T03-00-00-000Z.sqlite",
    ]);
  });

  it("refuses to run when the database is missing", () => {
    const directory = tempDirectory();

    expect(() =>
      backupDatabase({
        databasePath: path.join(directory, "missing.sqlite"),
        backupDirectory: path.join(directory, "backups"),
      }),
    ).toThrow("does not exist");
  });
});

describe("pruneBackups", () => {
  it("ignores files that are not backups", () => {
    const directory = tempDirectory();
    const backupDirectory = path.join(directory, "backups");

    backupDatabase(
      {
        databasePath: createDatabase(directory),
        backupDirectory,
        keep: 1,
      },
      new Date("2026-10-10T01:00:00.000Z"),
    );
    writeFileSync(path.join(backupDirectory, "keep-me.txt"), "not a backup");

    expect(pruneBackups(backupDirectory, 1)).toEqual([]);
    expect(readdirSync(backupDirectory).sort()).toEqual([
      "arcproof-2026-10-10T01-00-00-000Z.sqlite",
      "keep-me.txt",
    ]);
  });
});
