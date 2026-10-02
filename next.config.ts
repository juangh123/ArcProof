import type { NextConfig } from "next";

// Standalone output is required for the production Docker image. It can be
// disabled for a local Windows build when developer-mode symlinks are
// unavailable; CI and Railway keep the default.
const standaloneOutput = process.env.NEXT_STANDALONE !== "false";

const nextConfig: NextConfig = {
  output: standaloneOutput ? "standalone" : undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    const isDevelopment = process.env.NODE_ENV !== "production";
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      `connect-src 'self' https://rpc.mainnet.arc.io https://rpc.testnet.arc.io${isDevelopment ? " ws: http: https:" : ""}`,
      "font-src 'self' data:",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "worker-src 'self' blob:",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/proof/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
