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
    env: {
      ARCPROOF_DATA_DIR: preserve(),
      ARCPROOF_VERSION: preserve(),
      ARC_NETWORK: preserve(),
      ARC_PAYMENT_MODE: preserve(),
      ARC_QUOTE_PRICE_USDC: preserve(),
      ARC_RECIPIENT_ADDRESS: preserve(),
    },
    volumeMounts: {
      "/data": data,
    },
  });
  return project("ArcProof", {
    resources: [ArcProof, data],
  });
});
