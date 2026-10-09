import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicArcConfig } from "@/lib/arc/config";
import { payOrderWithArc } from "@/lib/arc/wallet";

const config: PublicArcConfig = {
  network: "testnet",
  name: "Arc Testnet",
  chainId: 5_042_002,
  rpcUrl: "https://rpc.testnet.arc.io",
  explorerUrl: "https://explorer.testnet.arc.io",
  paymentMode: "fixture",
  recipientAddress: "0x1111111111111111111111111111111111111111",
  quotePriceUsdc: "0.10",
  configured: true,
  configErrors: [],
  contracts: {
    usdc: "0x3600000000000000000000000000000000000000",
    memo: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
    nativeUsdcEmitter: "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE",
  },
};

const order = {
  amountDisplay: "0.10",
  paymentMemoId: `0x${"1".repeat(64)}` as const,
  publicId: "AP-12345678",
  recipientAddress: "0x1111111111111111111111111111111111111111",
  network: "testnet",
  chainId: 5_042_002,
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("payOrderWithArc", () => {
  it("rejects a stale order from a different network before touching the wallet", async () => {
    vi.stubGlobal("window", { ethereum: {} });

    await expect(
      payOrderWithArc({
        config,
        order: { ...order, chainId: 5_042 },
      }),
    ).rejects.toThrow(/different Arc network/);
  });

  it("rejects a stale order with a different receiving address", async () => {
    vi.stubGlobal("window", { ethereum: {} });

    await expect(
      payOrderWithArc({
        config,
        order: {
          ...order,
          recipientAddress: "0x2222222222222222222222222222222222222222",
        },
      }),
    ).rejects.toThrow(/different Arc network/);
  });
});
