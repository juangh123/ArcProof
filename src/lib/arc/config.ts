import { getAddress, isAddress } from "viem";

export const ARC_CONTRACTS = {
  usdc: "0x3600000000000000000000000000000000000000",
  memo: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
  nativeUsdcEmitter: "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE",
} as const;

// Keep the code default aligned with the documented and published 0.10 USDC
// service price so a missing environment variable cannot silently overcharge.
export const DEFAULT_QUOTE_PRICE_USDC = "0.10";

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
  configErrors: string[];
};

const QUOTE_PRICE_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;
const ZERO_PRICE_PATTERN = /^0(?:\.0+)?$/;

function parseNetwork(
  value: string | undefined,
  configErrors: string[],
): ArcNetworkName {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return "mainnet";
  }

  if (normalized === "mainnet" || normalized === "testnet") {
    return normalized;
  }

  // Never silently fall back to a real-money network when the value is wrong.
  configErrors.push('ARC_NETWORK must be either "mainnet" or "testnet".');
  return "mainnet";
}

function parsePaymentMode(
  value: string | undefined,
  network: ArcNetworkName,
  configErrors: string[],
): PaymentMode {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return "live";
  }

  if (normalized !== "live" && normalized !== "fixture") {
    configErrors.push('ARC_PAYMENT_MODE must be either "live" or "fixture".');
    return "live";
  }

  if (normalized === "fixture") {
    if (process.env.NODE_ENV === "production" || network !== "testnet") {
      // Fail loudly instead of silently switching a test-intent deployment
      // to live payments.
      configErrors.push(
        "Fixture payment mode is only available outside production on Arc Testnet.",
      );
      return "live";
    }

    return "fixture";
  }

  return "live";
}

function parseRecipientAddress(
  value: string | undefined,
  configErrors: string[],
): `0x${string}` | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  if (!isAddress(normalized)) {
    configErrors.push("ARC_RECIPIENT_ADDRESS must be a valid EVM address.");
    return null;
  }

  return getAddress(normalized);
}

function parseQuotePrice(
  value: string | undefined,
  configErrors: string[],
): string {
  const normalized = value?.trim();

  if (!normalized) {
    return DEFAULT_QUOTE_PRICE_USDC;
  }

  if (
    !QUOTE_PRICE_PATTERN.test(normalized) ||
    ZERO_PRICE_PATTERN.test(normalized)
  ) {
    configErrors.push(
      "ARC_QUOTE_PRICE_USDC must be a positive USDC amount with at most six decimals.",
    );
    return DEFAULT_QUOTE_PRICE_USDC;
  }

  return normalized;
}

export function getArcRuntimeConfig(): ArcRuntimeConfig {
  const configErrors: string[] = [];
  const network = parseNetwork(process.env.ARC_NETWORK, configErrors);
  const defaults = ARC_NETWORKS[network];

  return {
    ...defaults,
    rpcUrl: process.env.ARC_RPC_URL?.trim() || defaults.rpcUrl,
    explorerUrl: process.env.ARC_EXPLORER_URL?.trim() || defaults.explorerUrl,
    network,
    paymentMode: parsePaymentMode(
      process.env.ARC_PAYMENT_MODE,
      network,
      configErrors,
    ),
    recipientAddress: parseRecipientAddress(
      process.env.ARC_RECIPIENT_ADDRESS,
      configErrors,
    ),
    quotePriceUsdc: parseQuotePrice(
      process.env.ARC_QUOTE_PRICE_USDC,
      configErrors,
    ),
    configErrors,
  };
}

export function getPublicArcConfig() {
  const config = getArcRuntimeConfig();

  return {
    network: config.network,
    name: config.name,
    chainId: config.chainId,
    // Browsers only ever receive the documented public RPC endpoint.
    // A private ARC_RPC_URL may embed an API key and must stay server-side.
    rpcUrl: ARC_NETWORKS[config.network].rpcUrl,
    explorerUrl: config.explorerUrl,
    paymentMode: config.paymentMode,
    recipientAddress: config.recipientAddress,
    quotePriceUsdc: config.quotePriceUsdc,
    configured:
      Boolean(config.recipientAddress) && config.configErrors.length === 0,
    configErrors: config.configErrors,
    contracts: ARC_CONTRACTS,
  };
}

export type PublicArcConfig = ReturnType<typeof getPublicArcConfig>;
