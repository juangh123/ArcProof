import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const globalForDatabase = globalThis as unknown as {
  arcProofDatabase?: DatabaseSync;
};

function ensureColumn(
  database: DatabaseSync,
  table: string,
  column: string,
  definition: string,
) {
  const columns = database
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;

  if (!columns.some((entry) => entry.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function createDatabase() {
  const dataDirectory =
    process.env.ARCPROOF_DATA_DIR ?? path.join(process.cwd(), "data");
  mkdirSync(dataDirectory, { recursive: true });

  const database = new DatabaseSync(
    process.env.ARCPROOF_DATABASE_PATH ??
      path.join(dataDirectory, "arcproof.sqlite"),
  );
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA busy_timeout = 5000;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      public_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_text TEXT NOT NULL,
      quote_result TEXT,
      extraction_mode TEXT,
      payment_memo_id TEXT NOT NULL UNIQUE,
      amount_display TEXT NOT NULL,
      amount_atomic18 TEXT NOT NULL,
      amount_atomic6 TEXT NOT NULL,
      recipient_address TEXT NOT NULL,
      network TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      tx_hash TEXT UNIQUE,
      payer_address TEXT,
      block_number TEXT,
      block_hash TEXT,
      payment_proof TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      verified_at TEXT,
      processed_at TEXT,
      processing_attempts INTEGER NOT NULL DEFAULT 0,
      processing_started_at TEXT,
      is_public INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_orders_public_id
      ON orders(public_id);
    CREATE INDEX IF NOT EXISTS idx_orders_tx_hash
      ON orders(tx_hash);
    CREATE INDEX IF NOT EXISTS idx_order_events_order_id
      ON order_events(order_id, id);
  `);

  ensureColumn(
    database,
    "orders",
    "processing_attempts",
    "INTEGER NOT NULL DEFAULT 0",
  );
  ensureColumn(database, "orders", "processing_started_at", "TEXT");

  return database;
}

export function getDatabase() {
  if (!globalForDatabase.arcProofDatabase) {
    globalForDatabase.arcProofDatabase = createDatabase();
  }

  return globalForDatabase.arcProofDatabase;
}

export function resetDatabaseForTests() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("The database can only be reset in tests.");
  }

  globalForDatabase.arcProofDatabase?.close();
  delete globalForDatabase.arcProofDatabase;
}
