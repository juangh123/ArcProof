# Arc Microgrants Form Answers

Use these answers after opening the event submission form and selecting the
existing ArcProof BUIDL:

https://dorahacks.io/hackathon/arc-microgrants/build

1. **Project name:** ArcProof
2. **Your name, alias, or team name:** Jason Huang
3. **Contact email:** use the email associated with your DoraHacks account
4. **Public builder profiles:** https://github.com/juangh123
5. **Live deployment on Arc mainnet:** https://arcproof-production.up.railway.app
6. **Arc mainnet transaction hash:** `0x780b08710fa38e12d35a117918508d2bead4f3e6c88bab203e48dd501d36fe80`
7. **Public repo:** https://github.com/juangh123/ArcProof
8. **Two-sentence description:** ArcProof turns supplier quotation documents
   into structured, validated purchasing line items. It releases the result
   only after the server independently verifies a final `0.10 USDC` payment on
   Arc Mainnet.
9. **What does it use Arc for?:** Arc is the settlement and proof layer:
   Chain ID `5042` final receipt verification, `Memo.memo` order binding,
   nested USDC recipient and amount validation, EIP-7708 native/ERC-20 event
   handling, transaction replay prevention, and release-after-settlement.
10. **Had you deployed to Arc before this project?:** answer accurately for the
    account receiving the microgrant.
11. **Have you received a Circle or Arc grant, bounty, or prize for this
    project?:** No.
12. **Anything else we should see?:** Public receipt:
    https://arcproof-production.up.railway.app/proof/AP-AC247758 · Repository
    contains 50 unit/integration tests and 8 Playwright tests across desktop
    and a 390px mobile viewport · CI is green on `master` · `pnpm preflight`
   and the mainnet smoke-verification path are documented in the repository ·
   CSV: https://arcproof-production.up.railway.app/api/proof/AP-AC247758/csv.

Submission status:

- The signed-in event Builds page shows `Your Build` -> `ArcProof` ->
  `Under Review`.
- The public Builds list and
  `https://dorahacks.io/api/v1/hub/hackathons/2238/buidls` can remain at
  `"count": 0` until DoraHacks approves the submission for public display. Do
  not treat that public count as a submission check.
- Remaining improvement: update the BUIDL description to 50 tests and attach
  the demo video.

## Submission material files

- Paste-ready BUIDL description: [DORAHACKS_BUIDL_DESCRIPTION.md](DORAHACKS_BUIDL_DESCRIPTION.md)
- Cover image: [arcproof-cover.png](assets/arcproof-cover.png)
- Square BUIDL icon: [arcproof-buidl-icon.png](assets/arcproof-buidl-icon.png)
- Demo video: https://github.com/juangh123/ArcProof/releases/download/v0.2.0/arcproof-demo.mp4
- Five-minute reviewer path: [REVIEWER_GUIDE.md](REVIEWER_GUIDE.md)
- Video timeline and narration: [DEMO.md](DEMO.md)
