import { getAddress, isAddress } from "viem";

export const ARC_CONTRACTS = {
  usdc: "0x3600000000000000000000000000000000000000",
  memo: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
  nativeUsdcEmitter: "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE",
} as const;

export type ArcNetworkName = "mainnet" | "testnet";
export type PaymentMode = "live" | "fixture";

type ArcNetworkConfig = {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
};

export const ARC_NETWORKS: Record<ArcNetworkName, ArcNetworkConfig> = {
  mainnet: {
    name: "Arc Mainnet",
    chainId: 5042,
    rpcUrl: "https://rpc.mainnet.arc.io",
    explorerUrl: "https://explorer.arc.io",
  },
  testnet: {
    name: "Arc Testnet",
    chainId: 5042002,
    rpcUrl: "https://rpc.testnet.arc.io",
    explorerUrl: "https://explorer.testnet.arc.io",
  },
};

export type ArcRuntimeConfig = ArcNetworkConfig & {
  network: ArcNetworkName;
  paymentMode: PaymentMode;
  recipientAddress: `0x${string}` | null;
  quotePriceUsdc: string;
};

function parseNetwork(value: string | undefined): ArcNetworkName {
  return value === "testnet" ? "testnet" : "mainnet";
}

function parsePaymentMode(
  value: string | undefined,
  network: ArcNetworkName,
): PaymentMode {
  if (
    value === "fixture" &&
    process.env.NODE_ENV !== "production" &&
    network === "testnet"
  ) {
    return "fixture";
  }

  return "live";
}

function parseRecipientAddress(
  value: string | undefined,
): `0x${string}` | null {
  if (!value || !isAddress(value)) {
    return null;
  }

  return getAddress(value);
}

export function getArcRuntimeConfig(): ArcRuntimeConfig {
  const network = parseNetwork(process.env.ARC_NETWORK);
  const defaults = ARC_NETWORKS[network];

  return {
    ...defaults,
    rpcUrl: process.env.ARC_RPC_URL ?? defaults.rpcUrl,
    explorerUrl: process.env.ARC_EXPLORER_URL ?? defaults.explorerUrl,
    network,
    paymentMode: parsePaymentMode(process.env.ARC_PAYMENT_MODE, network),
    recipientAddress: parseRecipientAddress(process.env.ARC_RECIPIENT_ADDRESS),
    quotePriceUsdc: process.env.ARC_QUOTE_PRICE_USDC ?? "3.00",
  };
}

export function getPublicArcConfig() {
  const config = getArcRuntimeConfig();

  return {
    network: config.network,
    name: config.name,
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    explorerUrl: config.explorerUrl,
    paymentMode: config.paymentMode,
    recipientAddress: config.recipientAddress,
    quotePriceUsdc: config.quotePriceUsdc,
    configured: Boolean(config.recipientAddress),
    contracts: ARC_CONTRACTS,
  };
}

export type PublicArcConfig = ReturnType<typeof getPublicArcConfig>;
