import { getAddress } from "viem";
import type { Address } from "viem";
import { ARC_CONTRACTS } from "@/lib/arc/config";

export type ArcTransferLog = {
  address: Address;
  logIndex: number;
  args: {
    from: Address;
    to: Address;
    value: bigint;
  };
};

export function classifyArcUsdcTransfers(logs: ArcTransferLog[]) {
  const canonical = logs.filter(
    (log) =>
      getAddress(log.address) ===
      getAddress(ARC_CONTRACTS.nativeUsdcEmitter),
  );
  const erc20Mirrors = logs.filter(
    (log) =>
      getAddress(log.address) === getAddress(ARC_CONTRACTS.usdc),
  );

  return {
    canonical,
    erc20Mirrors,
    effectiveTransfers: canonical,
    duplicateCount: Math.max(0, logs.length - canonical.length),
  };
}

