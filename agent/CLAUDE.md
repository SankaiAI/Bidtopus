# CLAUDE.md — Agent

You own everything inside `agent/`. You are the core of the product — an autonomous economic agent that underwrites performance contracts, negotiates terms, executes Meta Ads strategies, monitors outcomes, and triggers settlement.

Read [AGENT.md](AGENT.md) for the component map. Read [README.md](README.md) for engineering principles. Read [PRD.md](PRD.md) for full requirements. Read `docs/` for deep context on any specific component.

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
| **frontend** | Merchant-facing web app — all UI, Clerk auth, Circle App Kit wallet | You need a UI change or new field surfaced to the merchant |
| **backend** | REST API, PostgreSQL, state machine, Clerk JWT verification | You need a DB schema change, new endpoint, or different state gate behavior |
| **agent** ← you are here | ML underwriting, LLM negotiation, strategy generation, Meta Ads execution, Arc settlement | N/A — others submit tickets to you |
| **contracts** | Solidity escrow contract on Arc — ABI, deployed address, settlement logic | You need the contract address/ABI to wire up the Arc escrow adapter |

**Escalate to `needs: human` for:** PRD changes, spec conflicts, or decisions that affect more than one component.

---

## Non-Negotiable Rules

1. LLM never makes the settlement call. The deterministic resolution engine does.
2. No ad execution without merchant approval. Re-read approval status from DB with a row lock before calling any adapter.
3. Log intent before execution. Write to the audit logger BEFORE calling any adapter. If the process crashes, the intent is already persisted.
4. All LLM outputs are structured JSON. Validate the schema before any downstream action. Invalid output raises an error — never silently defaults.
5. Routing is state-driven, not keyword-driven. Contract state determines the next valid action. Never parse text to decide what to do.
6. Merchant input never in the system prompt. All merchant-controlled fields go in the `user` turn as structured JSON. The system prompt is a fixed constant.
7. Three interaction modes never mix. Negotiation loop, background scheduler, and chat Q&A are separate code paths. Chat Q&A has zero imports from execution modules.
8. Negotiation loop has a turn limit. Auto-reject when the limit is reached — see `config.py` for the value.
9. One ticket per blocker, ever. Never open a second ticket for the same need. If you are unsure whether one exists, search first — opening duplicates is worse than missing a ticket.

---

## When to Raise a Ticket

Raise a ticket when you hit something you **cannot resolve by reading your own files**.

| Situation | What to do |
|---|---|
| You need an endpoint, schema, or behavior owned by another component | Ticket to that component — `needs: backend/frontend/contracts` |
| The PRD and README contradict each other | Ticket to human — `needs: human` |
| Completing your work requires changing another component's behavior | Ticket to that component before making any assumptions |
| You think your own PRD needs to change | Ticket to human — `needs: human` — do not self-edit |

**Do not raise a ticket for:**
- Anything answerable by reading your own `PRD.md`, `README.md`, `AGENT.md`, or `docs/`
- Implementation decisions within your own directory
- Clarifications you can resolve with a reasonable assumption — make the assumption, note it in a code comment, keep moving

**Never edit another component's PRD or README.** If you believe a change is needed, raise a `needs: human` ticket describing what should change and why. The human decides.

---

## Cross-Team Coordination

Use the built-in skills — do not implement the ticket workflow manually:

- **To claim and resolve a ticket assigned to you:** `/resolve-ticket [issue-number]`
- **To submit a ticket to another team:** `/submit-ticket [target-team] short description`

The skills handle gh auth (bash and PowerShell), duplicate prevention, board moves, and the correct templates.

Reference issues in your commits: `Closes #3`
