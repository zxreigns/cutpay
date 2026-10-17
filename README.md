# CutPay

Milestone escrow for freelance video editors, settled in USDC on Arc.

CutPay lets a client fund an entire project up front — split across milestones — and guarantees the editor gets paid the moment each milestone is approved, with no manual trust required. If the client goes quiet, an auto-release mechanism pays the editor automatically once the review window expires. Everything runs on Arc, where USDC is the native gas token, keeping transaction costs stable and predictable.

---

## How it works

1. **Fund.** The client creates a job, naming the editor, the milestone breakdown, and a review window (24 h / 72 h / 7 days). The full USDC amount is pulled from the client's wallet into the escrow contract at creation time.

2. **Deliver.** The editor submits each milestone in order by committing the keccak256 hash of the deliverable link on-chain. Milestones are strictly sequential — the editor cannot submit milestone 2 until milestone 1 is Released or Split.

3. **Approve.** The client reviews and approves. USDC moves to the editor immediately via a direct token transfer; if the transfer fails for any reason (e.g. a blocklisted address on Arc), the amount is queued in `pendingWithdrawals` and the editor can call `withdraw()` at any time.

4. **Auto-release.** If the client neither approves nor disputes before the review window ends, anyone can call `claimAutoRelease` and the USDC goes straight to the editor.

5. **Dispute.** Inside the review window, the client can open a dispute. The editor can then call `acceptSplit` for a 50/50 split (rounding dust to the editor), or the client can call `releaseDisputed` to pay in full.

6. **Pay-to-unlock reveal.** The editor commits a hash of the deliverable URL at submission time. Once the milestone is Released or Split, the editor reveals the URL by calling `revealDeliverable(jobId, idx, url)`. The contract verifies `keccak256(bytes(url)) == deliverableHash`. The link is stored on-chain and becomes visible to anyone only after the money moved.

7. **Passport.** Each editor address accumulates stats: jobs completed, USDC earned, tips received, on-time approvals. These are public on-chain and surfaced on the editor's passport page.

8. **Tips.** Anyone can send a USDC tip to the editor on any job, bypassing escrow entirely.

---

## The product: the timeline is the escrow

CutPay's front end is built the way an editor already thinks — as a timeline.

- **Landing** — a live NLE-style timeline: Draft / Revision / Final sit as clips on a track, a playhead sweeps, and as it crosses each approved cut the USDC counter moves from the client's escrow to the editor's wallet. The numbers beside it (jobs, USDC escrowed, USDC released, editors paid) are read live from the contract.
- **Build the cut** (`/new`) — milestones are laid out as clips as you type; presets for common jobs; one Approve + one Fund transaction locks the whole budget.
- **Review Room** (`/job/:id`) — a frame viewer (revealed masters play inline), the job's timeline with the playhead on the current cut, timecoded notes the client keeps in-browser and copies to the editor, and a role-aware action deck. Approving a cut is the release moment: the clip turns green and the amount is shown leaving escrow on Arc, with the transaction link. Auto-release, dispute / 50-50 split and pay-to-unlock all live in the same room.
- **Editor passport** (`/editor/:address`) — a shareable, tilt-on-hover card whose numbers (jobs done, USDC earned, tips, on-time %) come only from the contract; "Hire this editor" pre-fills a new job.
- **Instant wallet** — one click, no extension; made for phones.

Typography: Instrument Serif + Geist + Geist Mono. Motion: Framer Motion. Palette: near-black, bone white, one electric blue for the in-review state, mint for money released, red reserved for the playhead.

---

## Instant wallet (phones, no extension)

Most of the editors CutPay is built for work from a phone and never installed MetaMask. CutPay ships a built-in **Instant wallet**: an opt-in wagmi connector that generates a private key in the browser on the user's explicit click, keeps it in `localStorage`, and signs with a viem `LocalAccount`. Nothing is generated on a fresh visit; a return visit with a stored key reconnects on its own. The wallet panel shows the address and live USDC balance and lets the user copy the address, export the key (two confirmations) or import an existing one.

Because USDC is Arc's gas token, funding it is one step: send USDC on Arc to the address. Fees are cents, so a $2 top-up covers dozens of jobs. The key never leaves the device and is never logged or traced (`src/instantWallet.ts`).

---

## Contract surface

File: `contracts/CutPayEscrow.sol`  
Compiler: Solidity 0.8.28 (pragma ^0.8.24), via the Arc Studio Foundry sandbox  
Dependencies: OpenZeppelin 5.1.0 (IERC20, SafeERC20, ReentrancyGuard)

| Function | Access | Description |
|---|---|---|
| `createJob(editor, title, amounts[], reviewWindow)` | anyone | Create a job; pulls sum(amounts) USDC from caller |
| `submitMilestone(jobId, idx, hash)` | editor | Commit deliverable hash; strictly in order |
| `approveMilestone(jobId, idx)` | client | Release milestone; pays editor immediately |
| `claimAutoRelease(jobId, idx)` | anyone | Auto-release after review window expires |
| `revealDeliverable(jobId, idx, uri)` | editor | Reveal URI after milestone Released or Split |
| `openDispute(jobId, idx)` | client | Open dispute inside review window |
| `acceptSplit(jobId, idx)` | editor | Accept 50/50 split on a disputed milestone |
| `releaseDisputed(jobId, idx)` | client | Pay editor in full from a dispute |
| `cancelJob(jobId)` | client | Cancel and refund all Pending milestones |
| `declineJob(jobId)` | editor | Decline before any work; refund everything |
| `tip(jobId, amount)` | anyone | Direct USDC tip to the editor |
| `withdraw()` | anyone | Collect deferred payout if direct transfer failed |
| `getJob(jobId)` | view | Job + all milestone data |
| `jobsByClient(address)` | view | Job IDs for a client |
| `jobsByEditor(address)` | view | Job IDs for an editor |
| `editorStats(address)` | view | Passport stats |
| `pendingWithdrawals(address)` | view | Deferred payout balance |

Key safety properties:
- `MAX_MILESTONES = 20` caps loop length to prevent block-gas DoS
- All custom errors (no string reverts) for gas efficiency and structured decoding
- Pull-payment fallback via `_pay()`: tries a direct transfer, defers to `pendingWithdrawals` + `PayoutDeferred` event on failure
- `nonReentrant` on every function that moves tokens
- Strict checks-effects-interactions ordering

---

## Arc-specific notes

- **USDC is gas.** The client needs only USDC: one `approve` + one `createJob`, no second token.
- **Two decimal views of one balance.** The native interface is 18 decimals, the ERC-20 view at `0x3600…0000` is 6. All app money math goes through `src/onchain-money.ts` (6-decimal ERC-20 amounts) and never mixes the two.
- **20 gwei fee floor.** The deploy script sets `maxFeePerGas` at max(1.5 × base, 25 gwei).
- **Blocklist reverts.** A transfer to a blocklisted address reverts without a receipt, so `_pay()` falls back to `pendingWithdrawals` + `PayoutDeferred` instead of locking the milestone.
- **Sub-second finality.** The UI waits for one receipt and moves on; no confirmation counting.

---

## How it was built

CutPay was built end-to-end in Arc Studio:

1. **Contract** — written from the spec as a single-file Solidity contract with no owner or admin role.

2. **Security review** — two independent review passes ran concurrently at maximum depth. Findings addressed before deploy:
   - Unbounded milestone loop DoS (fixed with `MAX_MILESTONES = 20`)
   - String `require` messages replaced with custom errors
   - Transfer-revert lock on Arc (fixed with the `_pay()` try/fallback pattern)

3. **Tests** — 26 Foundry tests (all passing) covering: create/fund, approve immediate payout, auto-release after warp, auto-release refused before window, out-of-order submit refused, dispute/split math (odd and even amounts), cancel refunds Pending only, reverts on Submitted/Disputed cancel, decline refunds all, reveal with wrong hash refused, reveal happy path, tip direct transfer, editor stats across all paths, `NothingToWithdraw` revert, `_pay()` fallback with toggle-able mock token, fuzz test (256 runs on split math), invariant test (escrow balance >= pending withdrawals).

4. **App** — five-page React/TypeScript/wagmi frontend: landing with live stats, new job form with 2-step approve+create, job page with milestone timeline, editor passport, and dashboard.

5. **Live dry run** — the testnet deployment above was exercised two ways before mainnet: from a terminal with `scripts/arc_deploy.py` (fund → approve → createJob → submitMilestone → approveMilestone → revealDeliverable, job #1) and through the app with the Instant wallet (job #2: approve + create on /new, approve on /job/2). That run caught and fixed a real bug: the Instant wallet connector handed wagmi a provider instead of a signing client, so `Approve` silently did nothing; the connector now implements `getClient()` and every write surfaces its error as a toast.

---

## Running locally

```bash
# Install dependencies
bun install

# Start the dev server (app on http://localhost:5173)
bun run dev

# Build for production
bun run build

# Run contract tests
bun run contracts:test

# Build contracts
bun run contracts:build
```

Environment variables (copy `.env.example` to `.env` and fill in):

```
VITE_ESCROW_ADDRESS=<deployed contract address>
VITE_ARC_NETWORK=testnet   # or "mainnet"
```

The app works without a wallet — it reads live contract state for the landing page stats. A wallet is required to create jobs, submit milestones, or approve.

---

## Deployments

| Network | Contract address | Example tx | Live URL |
|---|---|---|---|
| Arc Mainnet (chain 5042) | _[MAINNET_ADDRESS]_ | _[MAINNET_DEMO_TX]_ | _[LIVE_URL]_ |
| Arc Testnet (chain 5042002) | [`0xa3329FDd648586713AB6fA9e3F0fa9c3766786ab`](https://explorer.testnet.arc.io/address/0xa3329FDd648586713AB6fA9e3F0fa9c3766786ab) | [deploy](https://explorer.testnet.arc.io/tx/0x79898b3ee1c4988d47fed507910b5fb81cea59917cb57bf3b2b133edc42d0a09) · [createJob](https://explorer.testnet.arc.io/tx/0x4595cd102601d816695b27080799b2009887b0596a9ea29666680ecb127437ec) · [approveMilestone](https://explorer.testnet.arc.io/tx/0xb471305d1315ad927ebbf3bd3335b2caa52becbeb05df2376f1ab266963c804e) | https://cutpay-staging.pages.dev |

### Deploying yourself

The contract takes one constructor argument, the USDC address (`0x3600000000000000000000000000000000000000` on both Arc networks).

```bash
# 1. Build (inside Arc Studio, or locally with Arc Foundry)
forge build

# 2. Deploy with the plain-JSON-RPC script (no Foundry needed on the deploying machine).
#    The deployer key is read from the DEPLOYER_KEY environment variable and is never printed.
pip install eth-account eth-abi requests
export ARC_RPC=https://rpc.mainnet.arc.io ARC_CHAIN=5042   # or rpc.testnet.arc.io / 5042002
DEPLOYER_KEY=0x... python3 scripts/arc_deploy.py deploy contracts/out/CutPayEscrow.sol/CutPayEscrow.json

# 3. Point the app at it and build
echo "VITE_ESCROW_ADDRESS=0x<address>" > .env
echo "VITE_ARC_NETWORK=mainnet" >> .env
bun run build     # dist/ is a static site; host it anywhere (Cloudflare Pages, Vercel, ...)
```

`scripts/arc_deploy.py` also has `balance`, `approve`, `call` and `send` subcommands for driving the contract from a terminal (used for the demo transactions).

---

## License

MIT
