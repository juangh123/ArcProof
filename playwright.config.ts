import { defineConfig, devices } from "@playwright/test";

const port = 3_100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${port}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1_440, height: 1_000 },
      },
    },
    {
      name: "mobile-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: String(port),
      ARC_NETWORK: "testnet",
      ARC_PAYMENT_MODE: "fixture",
      ARC_RECIPIENT_ADDRESS: "0x1111111111111111111111111111111111111111",
      ARC_QUOTE_PRICE_USDC: "0.10",
      ARCPROOF_DATA_DIR: "./data/e2e",
    },
  },
});
