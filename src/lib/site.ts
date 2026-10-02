export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://arcproof-production.up.railway.app"
).replace(/\/$/, "");
