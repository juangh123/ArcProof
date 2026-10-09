import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Unit and integration coverage targets the server/domain layers. The
      // browser surface (fetch/localStorage/wallet modules and React panels)
      // is covered by the Playwright suite instead.
      include: ["src/lib/**/*.ts", "src/app/api/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "src/lib/api/order-client.ts",
        "src/lib/arc/wallet.ts",
        "src/lib/site.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 88,
        lines: 80,
      },
    },
  },
});
