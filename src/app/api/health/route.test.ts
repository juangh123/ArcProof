import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as healthGet } from "@/app/api/health/route";
import { resetDatabaseForTests } from "@/lib/server/db";
import { resetHealthCacheForTests } from "@/lib/server/health-cache";

const { mockClient } = vi.hoisted(() => ({
  mockClient: { getChainId: vi.fn() },
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();

  return {
    ...actual,
    createPublicClient: () => mockClient,
  };
});

const recipient = "0x1111111111111111111111111111111111111111";
const MANAGED_ENV = [
  "ARC_NETWORK",
  "ARC_PAYMENT_MODE",
  "ARC_QUOTE_PRICE_USDC",
  "ARC_RECIPIENT_ADDRESS",
] as const;

const originalEnv = Object.fromEntries(
  MANAGED_ENV.map((name) => [name, process.env[name]]),
) as Record<(typeof MANAGED_ENV)[number], string | undefined>;

let dataDirectory = "";

beforeAll(() => {
  dataDirectory = mkdtempSync(path.join(tmpdir(), "arcproof-health-"));
  process.env.ARCPROOF_DATA_DIR = dataDirectory;
  process.env.ARCPROOF_DATABASE_PATH = path.join(
    dataDirectory,
    "arcproof.sqlite",
  );
});

beforeEach(() => {
  process.env.ARC_NETWORK = "mainnet";
  process.env.ARC_PAYMENT_MODE = "live";
  process.env.ARC_RECIPIENT_ADDRESS = recipient;
  delete process.env.ARC_QUOTE_PRICE_USDC;
  mockClient.getChainId.mockReset();
  resetHealthCacheForTests();
  resetDatabaseForTests();
});

afterEach(() => {
  for (const name of MANAGED_ENV) {
    const value = originalEnv[name];

    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

afterAll(() => {
  resetDatabaseForTests();
  rmSync(dataDirectory, { recursive: true, force: true });
});

describe("health route", () => {
  it("reports ok when the database, RPC chain and configuration all match", async () => {
    mockClient.getChainId.mockResolvedValue(5_042);

    const response = await healthGet();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      writable: true,
      rpcChainId: 5_042,
      expectedChainId: 5_042,
      paymentMode: "live",
      configured: true,
      configErrors: [],
    });
  });

  it("fails the probe when the RPC reports a different chain", async () => {
    mockClient.getChainId.mockResolvedValue(1);

    const response = await healthGet();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.ok).toBe(false);
    expect(payload.rpcChainId).toBe(1);
  });

  it("fails the probe and reports invalid configuration", async () => {
    mockClient.getChainId.mockResolvedValue(5_042);
    process.env.ARC_QUOTE_PRICE_USDC = "0.1.0";

    const response = await healthGet();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.ok).toBe(false);
    expect(payload.configErrors.join(" ")).toContain("ARC_QUOTE_PRICE_USDC");
  });

  it("reports an explicit ARCPROOF_VERSION ahead of the platform commit", async () => {
    mockClient.getChainId.mockResolvedValue(5_042);
    process.env.ARCPROOF_VERSION = "deployed-revision";
    process.env.RAILWAY_GIT_COMMIT_SHA = "platform-revision";

    try {
      const payload = await (await healthGet()).json();

      expect(payload.version).toBe("deployed-revision");
    } finally {
      delete process.env.ARCPROOF_VERSION;
      delete process.env.RAILWAY_GIT_COMMIT_SHA;
    }
  });

  it("falls back to the platform commit and then to development", async () => {
    mockClient.getChainId.mockResolvedValue(5_042);
    delete process.env.ARCPROOF_VERSION;
    process.env.RAILWAY_GIT_COMMIT_SHA = "platform-revision";

    try {
      expect((await (await healthGet()).json()).version).toBe(
        "platform-revision",
      );

      delete process.env.RAILWAY_GIT_COMMIT_SHA;
      expect((await (await healthGet()).json()).version).toBe("development");
    } finally {
      delete process.env.RAILWAY_GIT_COMMIT_SHA;
      delete process.env.ARCPROOF_VERSION;
    }
  });
});
