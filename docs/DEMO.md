# Three-Minute Demo

This is the shortest reviewer path for the Arc Microgrants submission.

## 1. Open the live application

Open:

https://arcproof-production.up.railway.app

Confirm the header shows:

- `Chain 5042`
- `Live settlement`

The public health endpoint should also show `network: mainnet`, `paymentMode: live`, and `configured: true`:

https://arcproof-production.up.railway.app/api/health

## 2. Create a sample order

Click `Use sample quotation`.

The workbench creates an order, generates an order-specific Memo ID, and displays the fixed `0.10 USDC` price. The order is persisted in the server-side SQLite store.

## 3. Pay with MetaMask

Use a desktop browser with the MetaMask extension.

1. Connect the `0x57B...eda6` account used for the recorded payment.
2. Confirm the network is `Arc Mainnet`, Chain ID `5042`.
3. Click `Pay 0.10 USDC`.
4. Confirm the transaction targets the Memo contract.
5. Wait for the order to reach `Completed`.

Do not use a manual wallet transfer. The application builds the Memo calldata that binds the payment to the order.

## 4. Show the proof layer

Open the completed receipt:

https://arcproof-production.up.railway.app/proof/AP-AC247758

Show:

- `Completed`
- `0.10 USDC`
- Arc Mainnet and Chain ID `5042`
- The transaction hash
- Payer and recipient
- Memo ID
- Verification mode `live`
- Three structured quotation lines

Open the CSV:

https://arcproof-production.up.railway.app/api/orders/fc116601-6775-46aa-842a-c8d5eed5304a/csv

The recorded transaction is:

`0x780b08710fa38e12d35a117918508d2bead4f3e6c88bab203e48dd501d36fe80`

## 5. Show the verification boundary

The server checks the final Arc receipt before fulfillment:

- Chain ID `5042`
- Memo caller and Memo ID
- Nested USDC transfer recipient and amount
- EIP-7708 native event or the documented self-transfer exception
- ERC-20 mirror event
- Unique transaction use
- Atomic order binding

The frontend never marks an order as fulfilled by itself.

## Reviewer note

If you create a new order, it will require a real `0.10 USDC` payment on Arc Mainnet. The existing completed receipt and transaction hash are the recorded evidence for reviewers who only need to inspect the final result.
