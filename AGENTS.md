# CutPay

> Built with Arc Studio — milestone escrow for freelance video editors, settled in USDC on Arc.

---

## What This App Does

CutPay is a production-grade milestone escrow dapp for freelance video editors. A client hires an editor, funds the entire job in USDC up front, and the contract releases each milestone as the editor delivers and the client approves. Features: pay-to-unlock deliverable reveal (commit-reveal), auto-release after review window, 50/50 dispute split, tip jar, and a public editor passport page.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, react-router-dom v7
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity ^0.8.24 + Foundry. Sources in `contracts/`, tests in `contracts/test/CutPayEscrow.t.sol`.
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC (6 decimals) at `0x3600000000000000000000000000000000000000`

## Contract: CutPayEscrow

- Source: `contracts/CutPayEscrow.sol`
- Tests: `contracts/test/CutPayEscrow.t.sol` — **25/25 passing**
- USDC address (constructor arg): `0x3600000000000000000000000000000000000000`
- Deploy status: **PENDING** — platform wallet hit daily gas policy on Arc Testnet.

### To deploy (when policy resets):

```bash
# From the Arc Studio sandbox:
cd /home/user/app && forge build
# Then use the deploy_contract tool:
# name: CutPayEscrow, blockchain: ARC-TESTNET, constructorArgs: ["0x3600000000000000000000000000000000000000"]
# After deploy, update .env:
# echo 'VITE_ESCROW_ADDRESS=<deployed_address>' >> /home/user/app/.env
# Then restart the dev server.
```

## Key Files

- `src/App.tsx` — React Router setup
- `src/contract.ts` — ABI and contract address (reads from VITE_ESCROW_ADDRESS)
- `src/utils.ts` — shared helpers (formatUsdc, parseUsdc, status labels, error parser)
- `src/components/NavBar.tsx` — sticky navigation with wallet button
- `src/components/TxButton.tsx` — stateful transaction button
- `src/components/Card.tsx` — surface card + stat pills
- `src/pages/LandingPage.tsx` — hero + how-it-works + live stats
- `src/pages/NewJobPage.tsx` — 2-step create job form (approve USDC → create)
- `src/pages/JobPage.tsx` — milestone timeline, all actions, tip jar
- `src/pages/EditorPassportPage.tsx` — public editor profile + stats
- `src/pages/DashboardPage.tsx` — wallet's jobs as client/editor

## Security Review Summary

Three findings fixed before deploy:
1. (High) Unbounded milestone loop DoS → added `MAX_MILESTONES = 20` cap
2. (Medium) String `require` messages → replaced with custom errors throughout
3. (Critical) Transfer revert can brick escrow → pull-payment model: all outward transfers credit `pendingWithdrawals[recipient]`, users call `withdraw()` to collect

## Environment Variables

| Key | Description |
|---|---|
| `VITE_ESCROW_ADDRESS` | Deployed CutPayEscrow address on Arc Testnet |
