import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_QUOTE_PRICE_USDC,
  getPublicArcConfig,
  getArcRuntimeConfig,
} from "@/lib/arc/config";

const originalPrice = process.env.ARC_QUOTE_PRICE_USDC;

afterEach(() => {
  if (originalPrice === undefined) {
    delete process.env.ARC_QUOTE_PRICE_USDC;
  } else {
    process.env.ARC_QUOTE_PRICE_USDC = originalPrice;
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