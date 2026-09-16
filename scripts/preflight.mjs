import {
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
} from "viem";

const NETWORKS = {
  mainnet: {
    chainId: 5_042,
    rpcUrl: "https://rpc.mainnet.arc.io",
    explorerUrl: "https://explorer.arc.io",
  },
  testnet: {
    chainId: 5_042_002,
    rpcUrl: "https://rpc.testnet.arc.io",
    explorerUrl: "https://explorer.testnet.arc.io",
  },
};

const CONTRACTS = {
  usdc: "0x3600000000000000000000000000000000000000",
  memo: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
};

const BALANCE_OF_SELECTOR = "0x70a08231";
const failures = [];
const networkName = process.env.ARC_NETWORK === "testnet" ? "testnet" : "mainnet";
const network = NETWORKS[networkName];
const rpcUrl = process.env.ARC_RPC_URL || network.rpcUrl;
const publicBaseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
const expectedPaymentMode =
  process.env.EXPECTED_PAYMENT_MODE === "fixture" ? "fixture" : "live";
const recipientValue = process.env.ARC_RECIPIENT_ADDRESS?.trim();
const minimumNativeBalance = parseUnits(
  process.env.MIN_ARC_USDC_BALANCE || "0.20",
  18,
);

async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json();

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `${method} failed`);
  }

  return payload.result;
}

function check(condition, message) {
  if (condition) {
    console.log(`PASS ${message}`);
    return;
  }

  failures.push(message);
  console.error(`FAIL ${message}`);
}

console.log(`ArcProof ${networkName} preflight`);
console.log(`RPC ${rpcUrl}`);

try {
  const rpcChainId = Number.parseInt(await rpc("eth_chainId"), 16);
  check(
    rpcChainId === network.chainId,
    `RPC chain ID is ${rpcChainId}, expected ${network.chainId}`,
  );

  for (const [name, address] of Object.entries(CONTRACTS)) {
    const code = await rpc("eth_getCode", [address, "latest"]);
    check(code !== "0x", `${name} contract is deployed at ${address}`);
  }

  if (!recipientValue || !isAddress(recipientValue)) {
    check(false, "ARC_RECIPIENT_ADDRESS is a valid EVM address");
  } else {
    const recipient = getAddress(recipientValue);
    const fixtureAddresses = new Set([
      "0x0000000000000000000000000000000000000000",
      "0x1111111111111111111111111111111111111111",
    ]);

    if (networkName === "mainnet") {
      check(
        !fixtureAddresses.has(recipient),
        "mainnet recipient is not a fixture placeholder",
      );
    }

    const nativeBalance = BigInt(
      await rpc("eth_getBalance", [recipient, "latest"]),
    );
    const erc20Result = await rpc("eth_call", [
      {
        to: CONTRACTS.usdc,
        data: `${BALANCE_OF_SELECTOR}${recipient.slice(2).padStart(64, "0")}`,
      },
      "latest",
    ]);
    const erc20Balance = BigInt(erc20Result);

    console.log(`INFO recipient ${recipient}`);
    console.log(`INFO native balance ${formatUnits(nativeBalance, 18)} USDC`);
    console.log(`INFO ERC-20 balance ${formatUnits(erc20Balance, 6)} USDC`);
    check(
      nativeBalance >= minimumNativeBalance,
      `recipient balance is at least ${formatUnits(minimumNativeBalance, 18)} USDC`,
    );
  }

  if (publicBaseUrl) {
    const response = await fetch(`${publicBaseUrl}/api/health`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    const health = await response.json();

    check(response.ok, "public deployment health endpoint returns HTTP 2xx");
    check(health.ok === true, "public deployment reports ok: true");
    check(health.writable === true, "public SQLite volume is writable");
    check(
      health.expectedChainId === network.chainId,
      `public deployment uses Chain ID ${network.chainId}`,
    );
    check(
      health.paymentMode === expectedPaymentMode,
      `public deployment uses ${expectedPaymentMode} payment mode`,
    );
    check(health.configured === true, "public deployment has a recipient");
  } else {
    console.log("INFO PUBLIC_BASE_URL is not set; deployment checks were skipped");
  }
} catch (error) {
  check(
    false,
    error instanceof Error ? error.message : "Unexpected preflight error",
  );
}

if (failures.length > 0) {
  console.error(`\n${failures.length} preflight check(s) failed.`);
  process.exit(1);
}

console.log("\nAll ArcProof preflight checks passed.");
