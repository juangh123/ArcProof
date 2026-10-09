// Railway probes /api/health frequently, so the RPC chain check is cached
// briefly instead of hitting the provider on every probe. Failures are cached
// too, which keeps a down provider from being hammered by probe traffic.
export const HEALTH_RPC_CACHE_MS = 10_000;

const globalForHealth = globalThis as unknown as {
  arcProofHealthRpc?: { chainId: number | null; expiresAt: number };
};

export function resetHealthCacheForTests() {
  delete globalForHealth.arcProofHealthRpc;
}

export async function readCachedRpcChainId(
  client: { getChainId: () => Promise<number> },
  now = Date.now(),
): Promise<number | null> {
  const cached = globalForHealth.arcProofHealthRpc;

  if (cached && cached.expiresAt > now) {
    return cached.chainId;
  }

  let chainId: number | null = null;

  try {
    chainId = await client.getChainId();
  } catch {
    chainId = null;
  }

  globalForHealth.arcProofHealthRpc = {
    chainId,
    expiresAt: now + HEALTH_RPC_CACHE_MS,
  };

  return chainId;
}
