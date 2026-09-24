import {
  createPublicClient,
  decodeFunctionData,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseEventLogs,
  parseUnits,
  TransactionReceiptNotFoundError,
} from "viem";
import type { Address, Hex, Log } from "viem";
import { ARC_CONTRACTS, getArcRuntimeConfig } from "@/lib/arc/config";
import { memoAbi, transferEventAbi } from "@/lib/arc/abi";
import { classifyArcUsdcTransfers } from "@/lib/arc/events";
import type { PaymentProof } from "@/lib/domain/order";

export type PaymentVerificationResult =
  | { status: "pending" }
  | { status: "verified"; proof: PaymentProof }
  | { status: "rejected"; reason: string; details?: Record<string, unknown> };

type VerifyInput = {
  txHash: Hex;
  expectedMemoId: Hex;
  expectedAmountUsdc: string;
  expectedRecipient: Address;
};

export type ArcPaymentArtifacts = {
  transaction: {
    chainId: number | null;
    from: Address;
    to: Address | null;
    input: Hex;
  };
  receipt: {
    status: "success" | "reverted";
    blockNumber: bigint;
    blockHash: Hex | null;
    logs: Log[];
  };
};

function createArcClient() {
  const runtime = getArcRuntimeConfig();
  const chain = {
    id: runtime.chainId,
    name: runtime.name,
    nativeCurrency: {
      name: "USDC",
      symbol: "USDC",
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [runtime.rpcUrl],
      },
    },
  } as const;

  return {
    runtime,
    client: createPublicClient({
      chain,
      transport: http(runtime.rpcUrl, {
        timeout: 15_000,
        retryCount: 2,
      }),
    }),
  };
}

export function verifyArcPaymentArtifacts(
  input: VerifyInput & ArcPaymentArtifacts,
): PaymentVerificationResult {
  const { receipt, transaction } = input;

  if (receipt.status !== "success") {
    return {
      status: "rejected",
      reason: "The Arc transaction reverted.",
    };
  }

  if (transaction.chainId !== getArcRuntimeConfig().chainId) {
    return {
      status: "rejected",
      reason: `The transaction was submitted on chain ${transaction.chainId}, expected ${getArcRuntimeConfig().chainId}.`,
    };
  }

  if (
    !transaction.to ||
    getAddress(transaction.to) !== getAddress(ARC_CONTRACTS.memo)
  ) {
    return {
      status: "rejected",
      reason: "The transaction did not call the Arc Memo contract.",
    };
  }

  let outerCall: ReturnType<typeof decodeFunctionData>;

  try {
    outerCall = decodeFunctionData({
      abi: memoAbi,
      data: transaction.input,
    });
  } catch {
    return {
      status: "rejected",
      reason: "The transaction calldata could not be decoded as a Memo call.",
    };
  }

  if (outerCall.functionName !== "memo") {
    return {
      status: "rejected",
      reason: "The transaction did not call Memo.memo.",
    };
  }

  const outerArgs = outerCall.args as readonly [
    Address,
    Hex,
    Hex,
    Hex,
  ];
  const [memoTarget, innerData, memoId, memoData] = outerArgs;

  if (getAddress(memoTarget) !== getAddress(ARC_CONTRACTS.usdc)) {
    return {
      status: "rejected",
      reason: "The Memo call did not target the Arc USDC interface.",
      details: { memoTarget, memoData },
    };
  }

  if (memoId.toLowerCase() !== input.expectedMemoId.toLowerCase()) {
    return {
      status: "rejected",
      reason: "The Memo identifier does not match this order.",
      details: { memoId, expectedMemoId: input.expectedMemoId },
    };
  }

  let innerCall;

  try {
    innerCall = decodeFunctionData({
      abi: parseAbi([
        "function transfer(address to,uint256 amount) returns (bool)",
      ]),
      data: innerData,
    });
  } catch {
    return {
      status: "rejected",
      reason: "The Memo inner call was not a USDC transfer.",
    };
  }

  if (innerCall.functionName !== "transfer") {
    return {
      status: "rejected",
      reason: "The Memo inner call was not a USDC transfer.",
    };
  }

  const transferArgs = innerCall.args as readonly [Address, bigint];
  const expectedErc20Amount = parseUnits(input.expectedAmountUsdc, 6);
  const expectedNativeAmount = parseUnits(input.expectedAmountUsdc, 18);

  if (getAddress(transferArgs[0]) !== getAddress(input.expectedRecipient)) {
    return {
      status: "rejected",
      reason: "The transfer recipient does not match this order.",
      details: { actual: transferArgs[0], expected: input.expectedRecipient },
    };
  }

  if (transferArgs[1] !== expectedErc20Amount) {
    return {
      status: "rejected",
      reason: "The USDC amount does not match this order.",
      details: {
        actual: transferArgs[1].toString(),
        expected: expectedErc20Amount.toString(),
      },
    };
  }

  const memoEvents = parseEventLogs({
    abi: memoAbi,
    logs: receipt.logs,
    eventName: "Memo",
  }).filter(
    (event) =>
      getAddress(event.address) === getAddress(ARC_CONTRACTS.memo),
  );

  const matchingMemo = memoEvents.find(
    (event) =>
      event.args.memoId.toLowerCase() === input.expectedMemoId.toLowerCase(),
  );

  if (!matchingMemo) {
    return {
      status: "rejected",
      reason: "No matching Memo event was found in the transaction receipt.",
    };
  }

  if (
    getAddress(matchingMemo.args.sender) !==
    getAddress(transaction.from)
  ) {
    return {
      status: "rejected",
      reason: "The Memo sender does not match the transaction payer.",
    };
  }

  if (
    keccak256(innerData) !== matchingMemo.args.callDataHash.toLowerCase()
  ) {
    return {
      status: "rejected",
      reason: "The Memo calldata hash does not match the USDC transfer.",
    };
  }

  const transferLogs = parseEventLogs({
    abi: transferEventAbi,
    logs: receipt.logs,
    eventName: "Transfer",
  });
  const classifiedTransfers = classifyArcUsdcTransfers(
    transferLogs.map((event) => ({
      address: event.address,
      logIndex: event.logIndex,
      args: {
        from: event.args.from,
        to: event.args.to,
        value: event.args.value,
      },
    })),
  );
  const systemTransfers = classifiedTransfers.canonical.filter(
    (event) =>
      getAddress(event.args.to) === getAddress(input.expectedRecipient) &&
      event.args.value === expectedNativeAmount,
  );
  const erc20Transfers = classifiedTransfers.erc20Mirrors.filter(
    (event) =>
      getAddress(event.args.to) === getAddress(input.expectedRecipient) &&
      event.args.value === expectedErc20Amount,
  );
  const isSelfTransfer =
    getAddress(transaction.from) === getAddress(input.expectedRecipient);
  const nativeEventOmitted =
    isSelfTransfer && systemTransfers.length === 0;

  if (!nativeEventOmitted && systemTransfers.length !== 1) {
    return {
      status: "rejected",
      reason: `Expected one canonical 18-decimal native USDC transfer, found ${systemTransfers.length}.`,
    };
  }

  if (erc20Transfers.length !== 1) {
    return {
      status: "rejected",
      reason: `Expected one 6-decimal ERC-20 USDC transfer, found ${erc20Transfers.length}.`,
    };
  }

  const canonicalTransfer = nativeEventOmitted
    ? {
        logIndex: erc20Transfers[0].logIndex,
        args: { value: expectedNativeAmount },
      }
    : systemTransfers[0];

  if (!receipt.blockHash) {
    return {
      status: "rejected",
      reason: "The final receipt did not contain a block hash.",
    };
  }

  return {
    status: "verified",
    proof: {
      txHash: input.txHash,
      blockNumber: receipt.blockNumber.toString(),
      blockHash: receipt.blockHash,
      payerAddress: getAddress(transaction.from),
      recipientAddress: getAddress(input.expectedRecipient),
      memoId: input.expectedMemoId,
      amountNativeAtomic: canonicalTransfer.args.value.toString(),
      amountErc20Atomic: erc20Transfers[0].args.value.toString(),
      canonicalEmitter: getAddress(ARC_CONTRACTS.nativeUsdcEmitter),
      logIndex: canonicalTransfer.logIndex,
      nativeEventOmitted,
      verificationMode: "live",
    },
  };
}

function fixtureProof(
  input: VerifyInput,
): PaymentProof {
  return {
    txHash: input.txHash,
    blockNumber: "123456",
    blockHash: `0x${"1".repeat(64)}`,
    payerAddress: "0x1111111111111111111111111111111111111111",
    recipientAddress: input.expectedRecipient,
    memoId: input.expectedMemoId,
    amountNativeAtomic: parseUnits(input.expectedAmountUsdc, 18).toString(),
    amountErc20Atomic: parseUnits(input.expectedAmountUsdc, 6).toString(),
    canonicalEmitter: ARC_CONTRACTS.nativeUsdcEmitter,
    logIndex: 2,
    nativeEventOmitted: false,
    verificationMode: "fixture",
  };
}

export async function verifyArcPayment(
  input: VerifyInput,
): Promise<PaymentVerificationResult> {
  const { runtime, client } = createArcClient();

  if (runtime.paymentMode === "fixture") {
    return {
      status: "verified",
      proof: fixtureProof(input),
    };
  }

  const rpcChainId = await client.getChainId();

  if (rpcChainId !== runtime.chainId) {
    return {
      status: "rejected",
      reason: `The configured RPC returned chain ${rpcChainId}, expected ${runtime.chainId}.`,
    };
  }

  let receipt;

  try {
    receipt = await client.getTransactionReceipt({ hash: input.txHash });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) {
      return { status: "pending" };
    }
    throw error;
  }

  const transaction = await client.getTransaction({
    hash: input.txHash,
  });

  return verifyArcPaymentArtifacts({
    ...input,
    transaction: {
      chainId: transaction.chainId ?? null,
      from: transaction.from,
      to: transaction.to,
      input: transaction.input,
    },
    receipt: {
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      logs: receipt.logs,
    },
  });
}
