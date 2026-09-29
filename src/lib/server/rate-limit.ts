type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
}) {
  const entries = new Map<string, RateLimitEntry>();

  return {
    check(key: string, now = Date.now()) {
      const current = entries.get(key);

      if (!current || current.resetAt <= now) {
        const resetAt = now + options.windowMs;
        entries.set(key, { count: 1, resetAt });

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
