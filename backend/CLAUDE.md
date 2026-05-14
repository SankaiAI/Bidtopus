# CLAUDE.md — Backend

You own everything inside `backend/`. You build the FastAPI API and database layer. You route requests, enforce state gates, persist contract state, and call the agent. You do not contain business logic — that lives in the agent.

Read [README.md](README.md) for engineering principles. Read [PRD.md](PRD.md) for full requirements.

---

## Local Environment Setup

Always work inside a virtual environment. Never install packages globally.

```bash
python -m venv .venv
source .venv/bin/activate        # Mac/Linux
.venv\Scripts\activate           # Windows
pip install -r requirements.txt
```

If you install a new package, add it to `requirements.txt` immediately:
```bash
pip install <package> && pip freeze > requirements.txt
```

---

## Team Map — Who Does What

| Component | What it owns | Submit a `needs:` ticket when... |
|---|---|---|
| **frontend** | Merchant-facing web app — all UI, Clerk auth, Circle App Kit wallet | You need to change what the API returns or a new response shape |
| **backend** ← you are here | REST API, PostgreSQL, state machine, Clerk JWT verification | N/A — others submit tickets to you |
| **agent** | ML underwriting, LLM negotiation, strategy generation, Meta Ads execution, Arc settlement | You need a different data shape or new capability from the agent |
| **contracts** | Solidity escrow contract on Arc — ABI, deployed address, settlement logic | You need the contract address/ABI or a change to on-chain settlement |

**Escalate to `needs: human` for:** PRD changes, spec conflicts, or decisions that affect more than one component.

---

## Non-Negotiable Rules

1. Every state-transition endpoint checks pre-conditions before calling the agent. If the gate fails, return 400. No agent call happens.
2. Ownership check on every `/contracts/:id/*` endpoint. Merchant A must never touch Merchant B's contract.
3. The agent is called through a single import boundary only. No route or service file imports directly from `agent/`.
4. Dual-write on every notable action: internal observability store and merchant UI store. Never conflate them.
5. Resolution is idempotent. Check for an existing resolution before acting — network retries must be safe.
6. Sanitize LLM output before writing to the merchant message store.
7. Rate-limit all LLM-calling endpoints.
8. One ticket per blocker, ever. Never open a second ticket for the same need. If you are unsure whether one exists, search first — opening duplicates is worse than missing a ticket.
9. Prefer a documented assumption over a ticket. Only ticket when you genuinely cannot proceed without another component's help.
10. Never edit another component's PRD or README. Raise `needs: human` if you believe a change is needed — the human decides.

---

## Cross-Team Coordination

Use the built-in skills — do not implement the ticket workflow manually:

- **To claim and resolve a ticket assigned to you:** `/resolve-ticket [issue-number]`
- **To submit a ticket to another team:** `/submit-ticket [target-team] short description`

The skills handle gh auth (bash and PowerShell), duplicate prevention, board moves, and the correct templates.

Reference issues in your commits: `Closes #7`
