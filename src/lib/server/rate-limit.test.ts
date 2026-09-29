import { describe, expect, it } from "vitest";
import { createRateLimiter, getClientKey } from "@/lib/server/rate-limit";

describe("createRateLimiter", () => {
  it("limits requests inside the window and resets afterward", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000 });

    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 100).allowed).toBe(true);
    expect(limiter.check("ip", 200).allowed).toBe(false);
    expect(limiter.check("ip", 1_001).allowed).toBe(true);
  });

  it("tracks clients independently", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });

    expect(limiter.check("first", 0).allowed).toBe(true);
    expect(limiter.check("second", 100).allowed).toBe(true);
    expect(limiter.check("first", 200).allowed).toBe(false);
  });

  it("uses the proxy-appended client address", () => {
    const request = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 198.51.100.4",
      },
    });

    expect(getClientKey(request)).toBe("198.51.100.4");
  });
});
