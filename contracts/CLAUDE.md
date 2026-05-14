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

### Setup — run this once at the start of every session

```bash
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n" | git credential fill 2>/dev/null | grep password | cut -d= -f2)
export PATH="$PATH:/c/Program Files/GitHub CLI:/usr/local/bin"
```

This loads your GitHub token and adds `gh` to the PATH so all commands below work. Works on Windows, Mac, and Linux.

---

### Step 1 — Check for tickets assigned to you

```bash
gh issue list --label "needs: contracts" --state open --repo SankaiAI/outcomeX
gh issue view <number> --repo SankaiAI/outcomeX
```

Read the full issue before starting. The **Request** section says what to build. The **Definition of Done** says what your response must include.

### Step 2 — Claim the ticket when you start working

```bash
gh issue comment <number> --body "Picking this up now." --repo SankaiAI/outcomeX
bash .github/scripts/move_issue.sh <number> "In Progress"
```

This posts your pickup note and moves the card to the In Progress column on the project board.

### Step 3 — Close the ticket when done

```bash
gh issue comment <number> --body "Done. [your answer or summary of what was built]" --repo SankaiAI/outcomeX
gh issue close <number> --repo SankaiAI/outcomeX
bash .github/scripts/move_issue.sh <number> "Done"
```

Close the issue first, then move the card to Done. The requester sees your comment as the answer.

---

### Before creating any ticket — search first

```bash
gh issue list --repo SankaiAI/outcomeX --state open --search "keywords describing your issue"
```

If an open ticket already covers what you need, comment on it instead of opening a new one. Only create a new ticket if nothing matches.

### When you need something from another team

```bash
gh issue create \
  --title "[contracts → backend] Short description" \
  --label "needs: backend,api-contract" \
  --repo SankaiAI/outcomeX \
  --body "**From:** contracts
**To:** backend
**Blocking:** what cannot be built until this is answered

## Request

## Definition of Done"
```

### When you need a human decision (spec conflict or PRD change)

```bash
gh issue create \
  --title "[contracts → human] Short description of the conflict or proposed change" \
  --label "needs: human" \
  --repo SankaiAI/outcomeX \
  --body "**From:** contracts
**Type:** spec-conflict OR prd-change-request
**Blocking:** what cannot be built until this is resolved

## What the current spec says

## What the problem is

## What I propose"
```

After a successful deploy, notify backend and agent:

```bash
gh issue create \
  --title "[contracts → all] Escrow deployed — address and ABI ready" \
  --label "needs: backend,needs: agent" \
  --repo SankaiAI/outcomeX \
  --body "Contract deployed to Arc testnet.

Address: 0x...
ABI: committed to contracts/out/abi.json
Explorer: <link>"
```

Reference issues in commits: `Closes #2`
