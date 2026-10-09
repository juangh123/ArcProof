import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as backupPost } from "@/app/api/admin/backup/route";
import { backupLimiter } from "@/lib/server/rate-limit";

const TOKEN = "test-backup-token";
let directory = "";

function seedDatabase(databasePath: string) {
  const database = new DatabaseSync(databasePath);

  database.exec(
    "CREATE TABLE orders (id TEXT PRIMARY KEY, status TEXT NOT NULL)",
  );
  database
    .prepare("INSERT INTO orders (id, status) VALUES (?, ?)")
    .run("order-1", "completed");
  database.close();
}

function request(token?: string) {
  return backupPost(
    new Request("http://localhost/api/admin/backup", {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "arcproof-admin-backup-"));
  process.env.ARCPROOF_DATABASE_PATH = path.join(directory, "arcproof.sqlite");
  process.env.ARCPROOF_BACKUP_DIR = path.join(directory, "backups");
  process.env.BACKUP_TOKEN = TOKEN;
  backupLimiter.clear();
});

afterEach(() => {
  delete process.env.BACKUP_TOKEN;
  delete process.env.ARCPROOF_DATABASE_PATH;
  delete process.env.ARCPROOF_BACKUP_DIR;
  rmSync(directory, { recursive: true, force: true });
});

describe("admin backup route", () => {
  it("stays disabled until a token is configured", async () => {
    delete process.env.BACKUP_TOKEN;

    expect((await request(TOKEN)).status).toBe(503);
  });

  it("rejects a missing or wrong token", async () => {
    expect((await request()).status).toBe(401);
    expect((await request("wrong-token")).status).toBe(401);
  });

  it("writes a verified backup for an authenticated caller", async () => {
    seedDatabase(process.env.ARCPROOF_DATABASE_PATH!);

    const response = await request(TOKEN);

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.ok).toBe(true);
    expect(payload.backup.orders).toBe(1);
    expect(payload.backup.file).toMatch(/^arcproof-.*\.sqlite$/);
    expect(readdirSync(process.env.ARCPROOF_BACKUP_DIR!)).toEqual([
      payload.backup.file,
    ]);

    const copy = new DatabaseSync(
      path.join(process.env.ARCPROOF_BACKUP_DIR!, payload.backup.file),
      { readOnly: true },
    );
    const row = copy
      .prepare("SELECT status FROM orders WHERE id = ?")
      .get("order-1") as { status: string } | undefined;
    copy.close();

    expect(row?.status).toBe("completed");
  });

  it("fails safely when the database is missing", async () => {
    const response = await request(TOKEN);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "The backup could not be completed.",
    });
  });
});
