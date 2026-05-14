# CLAUDE.md — Contracts

You own everything inside `contracts/`. You write, test, and deploy the Solidity escrow contract to Arc testnet. The contract is deployed once and produces a contract address that the backend and agent reference for all settlement actions.

Read [README.md](README.md) for engineering principles. Read [PRD.md](PRD.md) for full requirements.

---

## Team Map — Who Does What

| Component | What it owns | Submit a `needs:` ticket when... |
|---|---|---|
| **frontend** | Merchant-facing web app — all UI, Clerk auth, Circle App Kit wallet | You need a UI change or new field surfaced to the merchant |
| **backend** | REST API, PostgreSQL, state machine, Clerk JWT verification | You need a DB schema change, new endpoint, or state gate behavior |
| **agent** | ML underwriting, LLM negotiation, strategy generation, Meta Ads execution, Arc settlement | You need the agent's settler wallet address to set as authorized settler at deploy time |
| **contracts** ← you are here | Solidity escrow contract on Arc — ABI, deployed address, settlement logic | N/A — others submit tickets to you |

**Escalate to `needs: human` for:** PRD changes, spec conflicts, or decisions that affect more than one component.

---

## Non-Negotiable Rules

1. Check-effects-interactions on every state-changing function. Update contract state before making external calls. This prevents reentrancy.
2. Only the authorized settler can call `release()` and `refund()`. The settler address is set at deploy time and cannot be changed.
3. No double settlement. Both `release()` and `refund()` must revert if already settled.
4. Emit an event for every fund movement. The agent and frontend read these — no silent transfers.
5. Use a safe ERC20 transfer wrapper. Never use raw `transfer()` on ERC20 tokens.
6. Verify the USDC token address at deploy time. Print it to console and require explicit confirmation before proceeding.
7. Write the ABI and contract address to `out/` immediately after every deploy. The agent reads these on startup — if they're missing, the escrow adapter fails.
8. One ticket per blocker, ever. Never open a second ticket for the same need. If you are unsure whether one exists, search first — opening duplicates is worse than missing a ticket.

---

## When to Raise a Ticket

Raise a ticket when you hit something you **cannot resolve by reading your own files**.

| Situation | What to do |
|---|---|
| You need a behavior or address owned by another component | Ticket to that component — `needs: backend/agent/frontend` |
| The PRD and README contradict each other | Ticket to human — `needs: human` |
| Completing your work requires changing another component's behavior | Ticket to that component before making any assumptions |
| You think your own PRD needs to change | Ticket to human — `needs: human` — do not self-edit |

**Do not raise a ticket for:**
- Anything answerable by reading your own `PRD.md` or `README.md`
- Implementation decisions within your own directory
- Clarifications you can resolve with a reasonable assumption — make the assumption, note it in a code comment, keep moving

**Never edit another component's PRD or README.** If you believe a change is needed, raise a `needs: human` ticket describing what should change and why. The human decides.

---

## Cross-Team Coordination

Use the built-in skills — do not implement the ticket workflow manually:

- **To claim and resolve a ticket assigned to you:** `/resolve-ticket [issue-number]`
- **To submit a ticket to another team:** `/submit-ticket [target-team] short description`

The skills handle gh auth (bash and PowerShell), duplicate prevention, board moves, and the correct templates.

After a successful deploy, use `/submit-ticket agent escrow deployed address and ABI ready` to notify backend and agent. The skill will search for an existing announcement before creating one.

Reference issues in your commits: `Closes #2`
