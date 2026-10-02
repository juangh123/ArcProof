# Three-Minute Demo

This is the shortest reviewer path for the Arc Microgrants submission.

Recorded demo video:

https://github.com/juangh123/ArcProof/releases/download/v0.2.0/arcproof-demo.mp4

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

https://arcproof-production.up.railway.app/api/proof/AP-AC247758/csv

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

## Suggested recording timeline

- `0:00-0:20`: Show the live app, `Chain 5042`, `Live settlement`, and the health endpoint.
- `0:20-1:00`: Click `Use sample quotation` and show the order-specific Memo ID and fixed price.
- `1:00-1:50`: Open the existing completed order and show the transaction, payer, recipient, Memo ID, and verification events.
- `1:50-2:20`: Open the CSV result and briefly explain the structured output.
- `2:20-2:50`: Summarize the server-side verification boundary and the Arc-specific EIP-7708 handling.

## Narration script

- `0:00`: "Supplier quotations still get copied into spreadsheets by hand. ArcProof turns them into validated line items and settles the service fee on Arc."
- `0:20`: "I can upload a PDF or use the sample. The server validates the document before any payment request is created."
- `0:45`: "This order has an order-specific Memo ID and a fixed price of 0.10 USDC. The wallet calls Memo.memo with a nested USDC transfer, so the payment is bound to this order."
- `1:15`: "This completed receipt is a real Arc Mainnet payment. It shows the payer, recipient, Memo ID, block, transaction hash, and the EIP-7708 event representation."
- `1:50`: "Only after final settlement does the server release the structured result. The public CSV contains the three extracted quotation lines."
- `2:10`: "Fulfillment is not based on the browser's success state. The server independently verifies the final receipt, Memo binding, recipient, amount, event model, and transaction uniqueness."
- `2:30`: "ArcProof is live on Arc Mainnet, with a public proof, CSV output, automated tests, and a reproducible deployment."
