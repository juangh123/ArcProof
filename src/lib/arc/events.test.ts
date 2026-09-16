import { describe, expect, it } from "vitest";
import { ARC_CONTRACTS } from "@/lib/arc/config";
import { classifyArcUsdcTransfers } from "@/lib/arc/events";

describe("classifyArcUsdcTransfers", () => {
  it("uses the 18-decimal native event as the canonical transfer", () => {
    const transfers = classifyArcUsdcTransfers([
      {
        address: ARC_CONTRACTS.usdc,
        logIndex: 0,
        args: {
          from: "0x1111111111111111111111111111111111111111",
          to: "0x2222222222222222222222222222222222222222",
          value: 3_000_000n,
        },
      },
      {
        address: ARC_CONTRACTS.nativeUsdcEmitter,
        logIndex: 1,
        args: {
          from: "0x1111111111111111111111111111111111111111",
          to: "0x2222222222222222222222222222222222222222",
          value: 3_000_000_000_000_000_000n,
        },
      },
    ]);

    expect(transfers.effectiveTransfers).toHaveLength(1);
    expect(transfers.effectiveTransfers[0].args.value).toBe(
      3_000_000_000_000_000_000n,
    );
    expect(transfers.erc20Mirrors).toHaveLength(1);
    expect(transfers.duplicateCount).toBe(1);
  });

  it("does not treat an amount in 6-decimal units as canonical USDC", () => {
    const transfers = classifyArcUsdcTransfers([
      {
        address: ARC_CONTRACTS.usdc,
        logIndex: 0,
        args: {
          from: "0x1111111111111111111111111111111111111111",
          to: "0x2222222222222222222222222222222222222222",
          value: 3_000_000n,
        },
      },
    ]);

    expect(transfers.effectiveTransfers).toHaveLength(0);
  });
});

