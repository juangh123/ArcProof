#!/usr/bin/env node
// CLI wrapper around the shared backup core. Node 24 strips the types of the
// imported .ts module, so no build step is required inside the container.
import { pathToFileURL } from "node:url";
import {
  backupDatabase,
  resolveBackupPaths,
} from "../src/lib/server/sqlite-backup.ts";

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
