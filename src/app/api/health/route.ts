import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { getArcRuntimeConfig } from "@/lib/arc/config";
import { getDatabase } from "@/lib/server/db";
import { readCachedRpcChainId } from "@/lib/server/health-cache";

export const runtime = "nodejs";

export async function GET() {
  const config = getArcRuntimeConfig();
  const database = getDatabase();
  const row = database.prepare("SELECT 1 AS ok").get() as { ok: number };
  let writable = false;

  try {
    database.exec("BEGIN IMMEDIATE; COMMIT;");
    writable = true;
  } catch {
    writable = false;
  }

  const chain = {
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
  } as const;
  const client = createPublicClient({
    chain,
    transport: http(config.rpcUrl, { timeout: 10_000 }),
  });

  const rpcChainId = await readCachedRpcChainId(client);

  const configured = Boolean(config.recipientAddress);
  const ok =
    row.ok === 1 &&
    writable &&
    rpcChainId === config.chainId &&
    configured &&
    config.configErrors.length === 0;
  const version =
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.ARCPROOF_VERSION ??
    "development";

  return NextResponse.json(
    {
      ok,
      database: row.ok === 1,
      writable,
      rpcChainId,
      expectedChainId: config.chainId,
      network: config.network,
      paymentMode: config.paymentMode,
      quotePriceUsdc: config.quotePriceUsdc,
      configured,
      configErrors: config.configErrors,
      version,
      timestamp: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
