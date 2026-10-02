"use client";

import {
  createWalletClient,
  custom,
  getAddress,
  parseUnits,
  UserRejectedRequestError,
} from "viem";
import type { Address, Chain, Hex } from "viem";
import { encodeMemoTransfer } from "@/lib/arc/abi";
import type { PublicArcConfig } from "@/lib/arc/config";

declare global {
  interface Window {
    ethereum?: Parameters<typeof custom>[0];
  }
}

function toArcChain(config: PublicArcConfig): Chain {
  return {
    id: config.chainId,
    name: config.name,
    nativeCurrency: {
      name: "USDC",
      symbol: "USDC",
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [config.rpcUrl],
      },
    },
    blockExplorers: {
      default: {
        name: config.name,
        url: config.explorerUrl,
      },
    },
  };
}

export async function payOrderWithArc(input: {
  config: PublicArcConfig;
  order: {
    amountDisplay: string;
    paymentMemoId: Hex;
    publicId: string;
    recipientAddress: Address;
    network: "mainnet" | "testnet";
    chainId: number;
  };
}): Promise<Hex> {
  if (!window.ethereum) {
    throw new Error("No browser wallet was found.");
  }

  const orderRecipient = getAddress(input.order.recipientAddress);

  if (
    input.order.network !== input.config.network ||
    input.order.chainId !== input.config.chainId ||
    !input.config.recipientAddress ||
    orderRecipient !== getAddress(input.config.recipientAddress)
  ) {
    throw new Error(
      "This payment request was created for a different Arc network or receiving address. Create a new order before paying.",
    );
  }

  const chain = toArcChain(input.config);
  const walletClient = createWalletClient({
    transport: custom(window.ethereum),
  });
  const [account] = await walletClient.requestAddresses();

  if (!account) {
    throw new Error("The wallet did not return an account.");
  }

  try {
    await walletClient.switchChain({ id: chain.id });
  } catch {
    await walletClient.addChain({ chain });
    await walletClient.switchChain({ id: chain.id });
  }

  const payment = encodeMemoTransfer({
    usdcAddress: input.config.contracts.usdc as Address,
    recipientAddress: getAddress(input.config.recipientAddress),
    amountAtomic6: parseUnits(input.order.amountDisplay, 6),
    memoId: input.order.paymentMemoId,
    publicId: input.order.publicId,
  });

  try {
    return await walletClient.sendTransaction({
      account,
      chain,
      to: input.config.contracts.memo as Address,
      data: payment.data,
      value: 0n,
    });
  } catch (error) {
    if (error instanceof UserRejectedRequestError) {
      throw new Error("The wallet request was rejected.");
    }
    throw error;
  }
}
