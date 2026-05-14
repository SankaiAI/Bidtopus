# CLAUDE.md — Frontend

You own everything inside `frontend/`. You build the merchant-facing web app. You render state from the backend — you do not contain business logic.

Read [README.md](README.md) for engineering principles. Read [PRD.md](PRD.md) for full requirements.

---

## Team Map — Who Does What

| Component | What it owns | Submit a `needs:` ticket when... |
|---|---|---|
| **frontend** ← you are here | Merchant-facing web app — all UI, Clerk auth, Circle App Kit wallet | N/A — others submit tickets to you |
| **backend** | REST API, PostgreSQL, state machine, Clerk JWT verification | You need a new endpoint, response shape change, or new DB field |
| **agent** | ML underwriting, LLM negotiation, strategy generation, Meta Ads execution, Arc settlement | You need different data surfaced in chat/stream or agent behavior change |
| **contracts** | Solidity escrow contract on Arc — ABI, deployed address, settlement logic | You need the Arc explorer URL format, contract address, or ABI for tx hash display |

**Escalate to `needs: human` for:** PRD changes, spec conflicts, or decisions that affect more than one component.

---

## Non-Negotiable Rules

1. Never put business logic in the frontend. Render what the backend returns.
2. Never render LLM output as raw HTML. Use `ReactMarkdown` with `html: () => null`.
3. Two approval gates must be hard-disabled until content is fully loaded — Fund Escrow and Approve Execution.
4. Workspace restore is two steps on mount: `GET /messages` first, then open SSE stream. Never skip the hydration step.
5. USDC amounts display at full precision. Never round or truncate before a transaction.
6. Clerk manages the session token. Never copy it to `localStorage`. Use `useAuth().getToken()` inline when sending requests.
7. Wallet connect (Circle App Kit) is separate from login (Clerk). Wallet connect happens at the Escrow Funding screen only.

---

## When to Raise a Ticket

Raise a ticket when you hit something you **cannot resolve by reading your own files**.

| Situation | What to do |
|---|---|
| You need an endpoint, schema, or behavior owned by another component | Ticket to that component — `needs: backend/agent/contracts` |
| The PRD and README contradict each other | Ticket to human — `needs: human` |
| Completing your work requires changing another component's behavior | Ticket to that component before making any assumptions |
| You think your own PRD needs to change | Ticket to human — `needs: human` — do not self-edit |

**Do not raise a ticket for:**
- Anything answerable by reading your own `PRD.md`, `README.md`, or `docs/`
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

### Step 1 — Find and read your tickets

```bash
gh issue list --label "needs: frontend" --state open --repo SankaiAI/outcomeX
gh issue view <number> --repo SankaiAI/outcomeX
```

Read the full issue. The **Request** section says what to build. The **Definition of Done** says what your response must include.

### Step 2 — Verify the ticket belongs to you

Before claiming, check your own codebase to confirm the work described lives inside `frontend/`.

Ask yourself:
- Does the change touch files I own?
- Is the capability being requested something I build, not another component?

**If yes — the ticket is yours:** proceed to Step 3.

**If no — the ticket was mislabeled:** comment to redirect it and do not claim it.

```bash
gh issue comment <number> --body "This looks like it belongs to [correct team]. Redirecting." --repo SankaiAI/outcomeX
gh issue edit <number> --remove-label "needs: frontend" --add-label "needs: [correct team]" --repo SankaiAI/outcomeX
```

### Step 3 — Claim the ticket and move it to In Progress

Only do this after confirming ownership in Step 2.

```bash
gh issue comment <number> --body "Confirmed this is mine. Picking it up now." --repo SankaiAI/outcomeX
bash .github/scripts/move_issue.sh <number> "In Progress"
```

This posts your pickup note and moves the card to the In Progress column on the project board.

### Step 4 — Close the ticket when done

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
  --title "[frontend → backend] Short description" \
  --label "needs: backend,api-contract" \
  --repo SankaiAI/outcomeX \
  --body "**From:** frontend
**To:** backend
**Blocking:** what cannot be built until this is answered

## Request

## Definition of Done"
```

### When you need a human decision (spec conflict or PRD change)

```bash
gh issue create \
  --title "[frontend → human] Short description of the conflict or proposed change" \
  --label "needs: human" \
  --repo SankaiAI/outcomeX \
  --body "**From:** frontend
**Type:** spec-conflict OR prd-change-request
**Blocking:** what cannot be built until this is resolved

## What the current spec says

## What the problem is

## What I propose"
```

Reference issues in commits: `Closes #14`
