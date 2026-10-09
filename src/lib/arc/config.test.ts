import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_QUOTE_PRICE_USDC,
  getPublicArcConfig,
  getArcRuntimeConfig,
} from "@/lib/arc/config";

const MANAGED_ENV = [
  "ARC_NETWORK",
  "ARC_PAYMENT_MODE",
  "ARC_QUOTE_PRICE_USDC",
  "ARC_RECIPIENT_ADDRESS",
  "ARC_RPC_URL",
] as const;

const originalEnv = Object.fromEntries(
  MANAGED_ENV.map((name) => [name, process.env[name]]),
) as Record<(typeof MANAGED_ENV)[number], string | undefined>;

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

describe("quote price configuration", () => {
  it("defaults to the published 0.10 USDC price when unset", () => {
    delete process.env.ARC_QUOTE_PRICE_USDC;

    expect(DEFAULT_QUOTE_PRICE_USDC).toBe("0.10");
    expect(getArcRuntimeConfig().quotePriceUsdc).toBe("0.10");
  });

  it("ignores blank values instead of falling back to a higher price", () => {
    process.env.ARC_QUOTE_PRICE_USDC = "   ";

    expect(getArcRuntimeConfig().quotePriceUsdc).toBe("0.10");
  });

  it("honors an explicit price and exposes it publicly", () => {
    process.env.ARC_QUOTE_PRICE_USDC = "1.50";

    expect(getArcRuntimeConfig().quotePriceUsdc).toBe("1.50");
    expect(getPublicArcConfig().quotePriceUsdc).toBe("1.50");
  });
});

describe("network configuration", () => {
  it("reports an invalid ARC_NETWORK instead of silently using mainnet", () => {
    process.env.ARC_NETWORK = "miannet";

    const config = getArcRuntimeConfig();

    expect(config.network).toBe("mainnet");
    expect(config.configErrors.join(" ")).toContain("ARC_NETWORK");
  });
});

describe("payment mode configuration", () => {
  it("refuses fixture payments on mainnet", () => {
    process.env.ARC_NETWORK = "mainnet";
    process.env.ARC_PAYMENT_MODE = "fixture";

    const config = getArcRuntimeConfig();

    expect(config.paymentMode).toBe("live");
    expect(config.configErrors.join(" ")).toContain("Fixture payment mode");
  });

  it("allows fixture payments on testnet outside production", () => {
    process.env.ARC_NETWORK = "testnet";
    process.env.ARC_PAYMENT_MODE = "fixture";

    const config = getArcRuntimeConfig();

    expect(config.paymentMode).toBe("fixture");
    expect(config.configErrors).toHaveLength(0);
  });
});

describe("recipient configuration", () => {
  it("reports a malformed receiving address", () => {
    process.env.ARC_RECIPIENT_ADDRESS = "not-an-address";

    const config = getArcRuntimeConfig();

    expect(config.recipientAddress).toBeNull();
    expect(config.configErrors.join(" ")).toContain("ARC_RECIPIENT_ADDRESS");
  });
});

describe("price validation", () => {
  it("reports an invalid price instead of silently charging the default", () => {
    process.env.ARC_QUOTE_PRICE_USDC = "0.1.0";

    const config = getArcRuntimeConfig();

    expect(config.quotePriceUsdc).toBe(DEFAULT_QUOTE_PRICE_USDC);
    expect(config.configErrors.join(" ")).toContain("ARC_QUOTE_PRICE_USDC");
  });

  it("rejects zero prices and more than six decimals", () => {
    process.env.ARC_QUOTE_PRICE_USDC = "0";
    expect(getArcRuntimeConfig().configErrors).toHaveLength(1);

    process.env.ARC_QUOTE_PRICE_USDC = "0.1234567";
    expect(getArcRuntimeConfig().configErrors).toHaveLength(1);

    process.env.ARC_QUOTE_PRICE_USDC = "0.123456";
    expect(getArcRuntimeConfig().configErrors).toHaveLength(0);
  });
});

describe("public configuration", () => {
  it("never exposes a private RPC override to the browser", () => {
    process.env.ARC_NETWORK = "testnet";
    process.env.ARC_RPC_URL = "https://private.example/rpc?key=secret";

    const publicConfig = getPublicArcConfig();

    expect(publicConfig.rpcUrl).toBe("https://rpc.testnet.arc.io");
    expect(JSON.stringify(publicConfig)).not.toContain("secret");
  });
});
