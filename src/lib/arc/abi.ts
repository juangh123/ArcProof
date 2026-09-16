import { encodeFunctionData, parseAbi, stringToHex } from "viem";
import type { Address, Hex } from "viem";

export const memoAbi = parseAbi([
  "function memo(address target, bytes data, bytes32 memoId, bytes memoData)",
  "event BeforeMemo(uint256 indexed memoIndex)",
  "event Memo(address indexed sender,address indexed target,bytes32 callDataHash,bytes32 indexed memoId,bytes memo,uint256 memoIndex)",
]);

export const transferEventAbi = parseAbi([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);

export function encodeMemoTransfer(input: {
  usdcAddress: Address;
  recipientAddress: Address;
  amountAtomic6: bigint;
  memoId: Hex;
  publicId: string;
}) {
  const transferData = encodeFunctionData({
    abi: parseAbi([
      "function transfer(address to,uint256 amount) returns (bool)",
    ]),
    functionName: "transfer",
    args: [input.recipientAddress, input.amountAtomic6],
  });

  const memoData = stringToHex(
    JSON.stringify({
      app: "arcproof",
      order: input.publicId,
      version: 1,
    }),
  );

  return {
    transferData,
    memoData,
    data: encodeFunctionData({
      abi: memoAbi,
      functionName: "memo",
      args: [
        input.usdcAddress,
        transferData,
        input.memoId,
        memoData,
      ],
    }),
  };
}
