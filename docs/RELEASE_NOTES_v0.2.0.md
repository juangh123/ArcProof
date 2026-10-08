# ArcProof v0.2.0

ArcProof is a working Arc Mainnet application for paid supplier-quote
extraction. This release packages the post-submission hardening on `master`.

## Mainnet proof

- Completed order: `AP-AC247758`
- Transaction: `0x780b08710fa38e12d35a117918508d2bead4f3e6c88bab203e48dd501d36fe80`
- Public receipt: https://arcproof-production.up.railway.app/proof/AP-AC247758
- CSV result: https://arcproof-production.up.railway.app/api/proof/AP-AC247758/csv

Self-test note: payer and recipient are the same EOA, so this is the
documented EIP-7708 self-transfer case where the protocol omits the native
event; verification uses the signed `Memo.memo` call plus the ERC-20 mirror.

## Included in this release

- Independent Memo and USDC transfer verification, including EIP-7708
  self-transfer handling and transaction replay prevention.
- Pre-payment document validation, server-side draft storage, and
  release-after-settlement processing.
- Payment-request expiry after seven days, server-side retention for support
  resolution, and protection against paying a submitted transaction twice.
- Public receipt recovery through the public order ID without exposing the
  internal order UUID.
- Atomic verification claims, so concurrent or stale verify requests cannot
  downgrade an order after its payment has been recorded.
- CSV formula neutralization, broader deterministic quote parsing, rate-limit
  memory bounds, and upload-size preflight checks.
- A production Docker build, Railway deployment configuration, desktop and
  mobile browser coverage, and a green CI pipeline.

## Verification

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`

The current suite contains 54 unit/integration tests and 8 browser tests
across desktop and a 390px mobile viewport.
