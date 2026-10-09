type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  maxEntries?: number;
  sweepIntervalMs?: number;
}) {
  const entries = new Map<string, RateLimitEntry>();
  const maxEntries = options.maxEntries ?? 10_000;
  const sweepIntervalMs = Math.max(
    1_000,
    options.sweepIntervalMs ?? Math.min(options.windowMs, 60_000),
  );
  let nextSweepAt = 0;

  function prune(now: number) {
    if (now >= nextSweepAt) {
      for (const [key, entry] of entries) {
        if (entry.resetAt <= now) {
          entries.delete(key);
        }
      }

      nextSweepAt = now + sweepIntervalMs;
    }

    // Bound memory even when every request presents a different client key.
    // Map iteration preserves insertion order, so this evicts the oldest keys.
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;

      if (typeof oldestKey !== "string") {
        break;
      }

      entries.delete(oldestKey);
    }
  }

  return {
    check(key: string, now = Date.now()) {
      prune(now);
      const current = entries.get(key);

      if (!current || current.resetAt <= now) {
        const resetAt = now + options.windowMs;
        entries.set(key, { count: 1, resetAt });
        prune(now);

        return {
          allowed: true,
          remaining: options.limit - 1,
          retryAfterSeconds: Math.ceil(options.windowMs / 1000),
        };
      }

      if (current.count >= options.limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((current.resetAt - now) / 1000),
          ),
        };
      }

      current.count += 1;

      return {
        allowed: true,
        remaining: options.limit - current.count,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((current.resetAt - now) / 1000),
        ),
      };
    },

    clear() {
      entries.clear();
      nextSweepAt = 0;
    },

    size() {
      return entries.size;
    },
  };
}

export const orderCreateLimiter = createRateLimiter({
  limit: 10,
  windowMs: 10 * 60_000,
});

export const orderVerifyLimiter = createRateLimiter({
  limit: 30,
  windowMs: 10 * 60_000,
});

export const orderProcessLimiter = createRateLimiter({
  limit: 20,
  windowMs: 10 * 60_000,
});

export const orderReadLimiter = createRateLimiter({
  limit: 60,
  windowMs: 10 * 60_000,
});

export function tooManyRequests(
  rateLimit: { retryAfterSeconds: number },
  message: string,
) {
  return Response.json(
    { error: message },
    {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    },
  );
}

export function getClientKey(request: Request) {
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  // Proxies append the connecting address. Use the last entry so a
  // client-supplied prefix cannot rotate the rate-limit key.
  return (
    forwardedFor?.at(-1) ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
