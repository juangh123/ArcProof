import {
  defineRailway,
  preserve,
  project,
  service,
  volume,
} from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "ArcProof";

export default defineRailway(() => {
  const data = volume("arcproof-volume", {
    region: "sfo",
    sizeMB: 500,
  });
  const ArcProof = service("ArcProof", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    healthcheck: "/api/health",
    healthcheckTimeout: 30,
    // Declare every variable the application reads with preserve() so a
    // destructive apply can never drop one silently. Removing variables
    // additionally requires --confirm-destructive.
    env: {
      ARCPROOF_DATA_DIR: preserve(),
      ARCPROOF_VERSION: preserve(),
      ARC_NETWORK: preserve(),
      ARC_PAYMENT_MODE: preserve(),
      ARC_QUOTE_PRICE_USDC: preserve(),
      ARC_RECIPIENT_ADDRESS: preserve(),
      ARC_RPC_URL: preserve(),
      ARC_EXPLORER_URL: preserve(),
      OPENAI_API_KEY: preserve(),
      OPENAI_MODEL: preserve(),
      NEXT_PUBLIC_SITE_URL: preserve(),
      NEXT_PUBLIC_REVIEW_PROOF_ID: preserve(),
      BACKUP_TOKEN: preserve(),
    },
    volumeMounts: {
      "/data": data,
    },
  });
  return project("ArcProof", {
    resources: [ArcProof, data],
  });
});
