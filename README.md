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

## Contract surface

File: `contracts/CutPayEscrow.sol`  
Compiler: Solidity ^0.8.24  
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

## How it was built

CutPay was built end-to-end in Arc Studio:

1. **Contract** — written from the spec as a single-file Solidity contract with no owner or admin role.

2. **Security review** — two independent review passes ran concurrently at maximum depth. Findings addressed before deploy:
   - Unbounded milestone loop DoS (fixed with `MAX_MILESTONES = 20`)
   - String `require` messages replaced with custom errors
   - Transfer-revert lock on Arc (fixed with the `_pay()` try/fallback pattern)

3. **Tests** — 27+ Foundry tests covering: create/fund, approve immediate payout, auto-release after warp, auto-release refused before window, out-of-order submit refused, dispute/split math (odd and even amounts), cancel refunds Pending only, reverts on Submitted/Disputed cancel, decline refunds all, reveal with wrong hash refused, reveal happy path, tip direct transfer, editor stats across all paths, `NothingToWithdraw` revert, `_pay()` fallback with toggle-able mock token, fuzz test (256 runs on split math), invariant test (escrow balance >= pending withdrawals).

4. **App** — five-page React/TypeScript/wagmi frontend: landing with live stats, new job form with 2-step approve+create, job page with milestone timeline, editor passport, and dashboard.

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
| Arc Mainnet | _(not yet deployed)_ | — | — |
| Arc Testnet | _(pending — see deploy instructions above)_ | — | — |

To deploy to Arc Testnet:

```bash
# In Arc Studio chat, or after forge build:
# Set VITE_ESCROW_ADDRESS in .env to the returned address.
forge build
# Then use the Arc Studio deploy tool or bun run deploy:self
```

---

## License

MIT
