import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HEALTH_RPC_CACHE_MS,
  readCachedRpcChainId,
  resetHealthCacheForTests,
} from "@/lib/server/health-cache";

afterEach(() => {
  resetHealthCacheForTests();
});

describe("readCachedRpcChainId", () => {
  it("reuses the probe result inside the cache window", async () => {
    const client = { getChainId: vi.fn().mockResolvedValue(5_042) };

    await expect(readCachedRpcChainId(client, 1_000)).resolves.toBe(5_042);
    await expect(readCachedRpcChainId(client, 2_000)).resolves.toBe(5_042);

    expect(client.getChainId).toHaveBeenCalledTimes(1);
  });

  it("probes again once the cache window has passed", async () => {
    const client = { getChainId: vi.fn().mockResolvedValue(5_042) };

    await readCachedRpcChainId(client, 1_000);
    await readCachedRpcChainId(client, 1_000 + HEALTH_RPC_CACHE_MS + 1);

    expect(client.getChainId).toHaveBeenCalledTimes(2);
  });

  it("caches a failed probe instead of retrying it on every health check", async () => {
    const client = {
      getChainId: vi.fn().mockRejectedValue(new Error("rpc unavailable")),
    };

    await expect(readCachedRpcChainId(client, 1_000)).resolves.toBeNull();
    await expect(readCachedRpcChainId(client, 2_000)).resolves.toBeNull();

    expect(client.getChainId).toHaveBeenCalledTimes(1);
  });
});
