import { describe, expect, it } from "vitest";
import { decodeFunctionData, keccak256, parseAbi } from "viem";
import { encodeMemoTransfer, memoAbi } from "@/lib/arc/abi";
import { ARC_CONTRACTS } from "@/lib/arc/config";

describe("encodeMemoTransfer", () => {
  it("binds one order memo to the expected USDC recipient and amount", () => {
    const memoId = `0x${"2".repeat(64)}` as const;
    const recipient = "0x2222222222222222222222222222222222222222" as const;
    const payment = encodeMemoTransfer({
      usdcAddress: ARC_CONTRACTS.usdc,
      recipientAddress: recipient,
      amountAtomic6: 3_000_000n,
      memoId,
      publicId: "AP-TEST",
    });
    const outer = decodeFunctionData({
      abi: memoAbi,
      data: payment.data,
    });
    const inner = decodeFunctionData({
      abi: parseAbi([
        "function transfer(address to,uint256 amount) returns (bool)",
      ]),
      data: outer.args[1],
    });

    expect(outer.functionName).toBe("memo");
    expect(outer.args[0]).toBe(ARC_CONTRACTS.usdc);
    expect(outer.args[2]).toBe(memoId);
    expect(keccak256(outer.args[1])).toBe(keccak256(payment.transferData));
    expect(inner.functionName).toBe("transfer");
    expect(inner.args[0]).toBe(recipient);
    expect(inner.args[1]).toBe(3_000_000n);
  });
});
