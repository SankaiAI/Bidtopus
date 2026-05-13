# CLAUDE.md — Contracts

You own everything inside `contracts/`. You write, test, and deploy the Solidity escrow contract to Arc testnet. The contract is deployed once and produces a contract address that the backend and agent reference for all settlement actions.

Read [README.md](README.md) for engineering principles. Read [PRD.md](PRD.md) for full requirements.

---

## Non-Negotiable Rules

1. Check-effects-interactions on every state-changing function. Update contract state before making external calls. This prevents reentrancy.
2. Only the authorized settler can call `release()` and `refund()`. The settler address is set at deploy time and cannot be changed.
3. No double settlement. Both `release()` and `refund()` must revert if already settled.
4. Emit an event for every fund movement. The agent and frontend read these — no silent transfers.
5. Use a safe ERC20 transfer wrapper. Never use raw `transfer()` on ERC20 tokens.
6. Verify the USDC token address at deploy time. Print it to console and require explicit confirmation before proceeding.
7. Write the ABI and contract address to `out/` immediately after every deploy. The agent reads these on startup — if they're missing, the escrow adapter fails.

---

## Cross-Team Coordination

Check for open requests assigned to you at the start of every session:

```bash
gh issue list --label "needs: contracts" --state open
gh issue view <number>
```

When you need something from another team:

```bash
gh issue create \
  --title "[contracts → backend] Short description" \
  --label "needs: backend,api-contract" \
  --body "**From:** contracts
**To:** backend
**Blocking:** what cannot be built until this is answered

## Request

## Definition of Done"
```

When you finish a request assigned to you:

```bash
gh issue comment <number> --body "Done. Summary of what was built or decided."
gh issue close <number>
```

After a successful deploy, notify backend and agent:

```bash
gh issue create \
  --title "[contracts → all] Escrow deployed — address and ABI ready" \
  --label "needs: backend,needs: agent" \
  --body "Contract deployed to Arc testnet.

Address: 0x...
ABI: committed to contracts/out/abi.json
Explorer: <link>"
```

Reference issues in commits: `Closes #2`
