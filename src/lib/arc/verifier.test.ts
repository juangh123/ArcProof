import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  keccak256,
  parseAbiParameters,
  TransactionReceiptNotFoundError,
} from "viem";
import type { Address, Hex, Log } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  encodeMemoTransfer,
  memoAbi,
  transferEventAbi,
} from "@/lib/arc/abi";
import { ARC_CONTRACTS } from "@/lib/arc/config";
import {
  verifyArcPayment,
  verifyArcPaymentArtifacts,
  type ArcPaymentArtifacts,
} from "@/lib/arc/verifier";

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    getChainId: vi.fn(),
    getTransactionReceipt: vi.fn(),
    getTransaction: vi.fn(),
  },
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();

  return {
    ...actual,
    createPublicClient: () => mockClient,
  };
});

const txHash = `0x${"1".repeat(64)}` as Hex;
const blockHash = `0x${"2".repeat(64)}` as Hex;
const payer = "0x2222222222222222222222222222222222222222" as Address;
const recipient = "0x3333333333333333333333333333333333333333" as Address;
const memoId = `0x${"4".repeat(64)}` as Hex;
const payment = encodeMemoTransfer({
  usdcAddress: ARC_CONTRACTS.usdc,
  recipientAddress: recipient,
  amountAtomic6: 100_000n,
  memoId,
  publicId: "AP-TEST",
});

function transferLog(
  address: Address,
  value: bigint,
  logIndex: number,
  from: Address = payer,
): Log {
  return {
    address,
    topics: encodeEventTopics({
      abi: transferEventAbi,
      eventName: "Transfer",
      args: { from, to: recipient },
    }),
    data: encodeAbiParameters(parseAbiParameters("uint256"), [value]),
    blockNumber: 100n,
    blockHash,
    transactionHash: txHash,
    transactionIndex: 0,
    logIndex,
    removed: false,
  } as Log;
}

function memoLog(sender: Address = payer): Log {
  return {
    address: ARC_CONTRACTS.memo,
    topics: encodeEventTopics({
      abi: memoAbi,
      eventName: "Memo",
      args: {
        sender,
        target: ARC_CONTRACTS.usdc,
        memoId,
      },
    }),
    data: encodeAbiParameters(
      parseAbiParameters("bytes32, bytes, uint256"),
      [keccak256(payment.transferData), payment.memoData, 0n],
    ),
    blockNumber: 100n,
    blockHash,
    transactionHash: txHash,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  } as Log;
}

function createArtifacts(): ArcPaymentArtifacts & {
  txHash: Hex;
  expectedMemoId: Hex;
  expectedAmountUsdc: string;
  expectedRecipient: Address;
} {
  return {
    txHash,
    expectedMemoId: memoId,
    expectedAmountUsdc: "0.10",
    expectedRecipient: recipient,
    transaction: {
      chainId: 5_042,
      from: payer,
      to: ARC_CONTRACTS.memo,
      input: payment.data,
    },
    receipt: {
      status: "success",
      blockNumber: 100n,
      blockHash,
      logs: [
        memoLog(),
        transferLog(ARC_CONTRACTS.usdc, 100_000n, 1),
        transferLog(
          ARC_CONTRACTS.nativeUsdcEmitter,
          100_000_000_000_000_000n,
          2,
        ),
      ],
    },
  };
}

describe("verifyArcPaymentArtifacts", () => {
  it("accepts one canonical and one ERC-20 transfer for the expected order", () => {
    const result = verifyArcPaymentArtifacts(createArtifacts());

    expect(result.status).toBe("verified");

    if (result.status === "verified") {
      expect(result.proof.memoId).toBe(memoId);
      expect(result.proof.amountNativeAtomic).toBe(
        "100000000000000000",
      );
      expect(result.proof.amountErc20Atomic).toBe("100000");
      expect(result.proof.nativeEventOmitted).toBe(false);
      expect(result.proof.verificationMode).toBe("live");
    }
  });

  it("accepts a self-transfer when EIP-7708 omits the native event", () => {
    const artifacts = createArtifacts();
    artifacts.transaction.from = recipient;
    artifacts.receipt.logs = [
      memoLog(recipient),
      transferLog(ARC_CONTRACTS.usdc, 100_000n, 1, recipient),
    ];
    const result = verifyArcPaymentArtifacts(artifacts);

    expect(result.status).toBe("verified");

    if (result.status === "verified") {
      expect(result.proof.nativeEventOmitted).toBe(true);
      expect(result.proof.amountNativeAtomic).toBe(
        "100000000000000000",
      );
      expect(result.proof.amountErc20Atomic).toBe("100000");
    }
  });

  it("rejects a non-self transfer without the native event", () => {
    const artifacts = createArtifacts();
    artifacts.receipt.logs = artifacts.receipt.logs.filter(
      (log) =>
        getAddress(log.address) !==
        getAddress(ARC_CONTRACTS.nativeUsdcEmitter),
    );
    const result = verifyArcPaymentArtifacts(artifacts);

    expect(result.status).toBe("rejected");

    if (result.status === "rejected") {
      expect(result.reason).toContain("Expected one canonical");
    }
  });

  it("rejects the wrong chain ID", () => {
    const artifacts = createArtifacts();
    artifacts.transaction.chainId = 1;

    expect(verifyArcPaymentArtifacts(artifacts)).toEqual({
      status: "rejected",
      reason: "The transaction was submitted on chain 1, expected 5042.",
    });
  });

  it("rejects the wrong Memo identifier", () => {
    const artifacts = createArtifacts();
    artifacts.expectedMemoId = `0x${"5".repeat(64)}`;
    const result = verifyArcPaymentArtifacts(artifacts);

    expect(result.status).toBe("rejected");

    if (result.status === "rejected") {
      expect(result.reason).toContain("Memo identifier");
    }
  });

  it("rejects the wrong recipient", () => {
    const artifacts = createArtifacts();
    artifacts.expectedRecipient =
      "0x4444444444444444444444444444444444444444";
    const result = verifyArcPaymentArtifacts(artifacts);

    expect(result.status).toBe("rejected");

    if (result.status === "rejected") {
      expect(result.reason).toContain("recipient");
    }
  });

  it("rejects the wrong amount", () => {
    const artifacts = createArtifacts();
    artifacts.expectedAmountUsdc = "0.11";
    const result = verifyArcPaymentArtifacts(artifacts);

    expect(result.status).toBe("rejected");

    if (result.status === "rejected") {
      expect(result.reason).toContain("amount");
    }
  });

  it("rejects a duplicated canonical transfer event", () => {
    const artifacts = createArtifacts();
    artifacts.receipt.logs.push(
      transferLog(
        ARC_CONTRACTS.nativeUsdcEmitter,
        100_000_000_000_000_000n,
        3,
      ),
    );
    const result = verifyArcPaymentArtifacts(artifacts);

    expect(result.status).toBe("rejected");

    if (result.status === "rejected") {
      expect(result.reason).toContain("Expected one canonical");
    }
  });

  it("rejects a reverted transaction", () => {
    const artifacts = createArtifacts();
    artifacts.receipt.status = "reverted";

    expect(verifyArcPaymentArtifacts(artifacts)).toEqual({
      status: "rejected",
      reason: "The Arc transaction reverted.",
    });
  });
});

describe("verifyArcPayment", () => {
  const originalEnv = {
    ARC_NETWORK: process.env.ARC_NETWORK,
    ARC_PAYMENT_MODE: process.env.ARC_PAYMENT_MODE,
  };

  const verifyInput = {
    txHash,
    expectedMemoId: memoId,
    expectedAmountUsdc: "0.10",
    expectedRecipient: recipient,
  };

  beforeEach(() => {
    process.env.ARC_NETWORK = "mainnet";
    process.env.ARC_PAYMENT_MODE = "live";
    mockClient.getChainId.mockReset();
    mockClient.getTransactionReceipt.mockReset();
    mockClient.getTransaction.mockReset();
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("treats an unmined transaction as pending", async () => {
    mockClient.getChainId.mockResolvedValue(5_042);
    mockClient.getTransactionReceipt.mockRejectedValue(
      new TransactionReceiptNotFoundError({ hash: txHash }),
    );

    await expect(verifyArcPayment(verifyInput)).resolves.toEqual({
      status: "pending",
    });
    expect(mockClient.getTransaction).not.toHaveBeenCalled();
  });

  it("rejects a receipt served by an RPC on the wrong chain", async () => {
    mockClient.getChainId.mockResolvedValue(1);

    const result = await verifyArcPayment(verifyInput);

    expect(result.status).toBe("rejected");

    if (result.status === "rejected") {
      expect(result.reason).toContain("configured RPC returned chain 1");
    }

    expect(mockClient.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("verifies a final Arc receipt fetched over RPC", async () => {
    const artifacts = createArtifacts();
    mockClient.getChainId.mockResolvedValue(5_042);
    mockClient.getTransactionReceipt.mockResolvedValue({
      status: "success",
      blockNumber: artifacts.receipt.blockNumber,
      blockHash: artifacts.receipt.blockHash,
      logs: artifacts.receipt.logs,
    });
    mockClient.getTransaction.mockResolvedValue({
      chainId: 5_042,
      from: payer,
      to: ARC_CONTRACTS.memo,
      input: payment.data,
    });

    const result = await verifyArcPayment(verifyInput);

    expect(result.status).toBe("verified");

    if (result.status === "verified") {
      expect(result.proof.txHash).toBe(txHash);
      expect(result.proof.amountErc20Atomic).toBe("100000");
    }
  });

  it("propagates RPC failures so the route can release the claim", async () => {
    mockClient.getChainId.mockResolvedValue(5_042);
    mockClient.getTransactionReceipt.mockRejectedValue(
      new Error("rpc unavailable"),
    );

    await expect(verifyArcPayment(verifyInput)).rejects.toThrow(
      "rpc unavailable",
    );
  });
});
