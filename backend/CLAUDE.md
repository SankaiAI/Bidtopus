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

---

## When to Raise a Ticket

Raise a ticket when you hit something you **cannot resolve by reading your own files**.

| Situation | What to do |
|---|---|
| You need an endpoint, schema, or behavior owned by another component | Ticket to that component — `needs: frontend/agent/contracts` |
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

**If your shell is bash (Mac/Linux/Git Bash):**
```bash
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n" | git credential fill 2>/dev/null | grep password | cut -d= -f2)
export PATH="$PATH:/c/Program Files/GitHub CLI:/usr/local/bin"
gh auth status
```

**If your shell is PowerShell (Windows):**
```powershell
$env:GH_TOKEN = (printf "protocol=https`nhost=github.com`n" | git credential fill 2>$null | Select-String "password" | ForEach-Object { $_ -replace "password=","" })
$env:PATH = "$env:PATH;C:\Program Files\GitHub CLI"
gh auth status
```

If `gh auth status` still says "not logged in", run:
```bash
gh auth login --with-token <<< "$GH_TOKEN"
```

This loads your GitHub token and adds `gh` to the PATH. Run `gh auth status` to confirm it worked before proceeding.

---

### Step 1 — Find and read your tickets

```bash
gh issue list --label "needs: backend" --state open --repo SankaiAI/outcomeX
gh issue view <number> --repo SankaiAI/outcomeX
```

Read the full issue. The **Request** section says what to build. The **Definition of Done** says what your response must include.

### Step 2 — Verify the ticket belongs to you

Before claiming, check your own codebase to confirm the work described lives inside `backend/`.

Ask yourself:
- Does the change touch files I own?
- Is the capability being requested something I build, not another component?

**If yes — the ticket is yours:** proceed to Step 3.

**If no — the ticket was mislabeled:** comment to redirect it and do not claim it.

```bash
gh issue comment <number> --body "This looks like it belongs to [correct team]. Redirecting." --repo SankaiAI/outcomeX
gh issue edit <number> --remove-label "needs: backend" --add-label "needs: [correct team]" --repo SankaiAI/outcomeX
```

### Step 3 — Claim the ticket and move it to In Progress

Only do this after confirming ownership in Step 2.

```bash
gh issue comment <number> --body "Confirmed this is mine. Picking it up now." --repo SankaiAI/outcomeX
bash "$(git rev-parse --show-toplevel)/.github/scripts/move_issue.sh" <number> "In Progress" || true
```

This posts your pickup note and moves the card to the In Progress column on the project board.

### Step 4 — Close the ticket when done

```bash
gh issue comment <number> --body "Done. [your answer or summary of what was built]" --repo SankaiAI/outcomeX
gh issue close <number> --repo SankaiAI/outcomeX
bash "$(git rev-parse --show-toplevel)/.github/scripts/move_issue.sh" <number> "Done" || true
```

Close the issue first, then move the card to Done. The requester sees your comment as the answer.

---

### Step 5 — Open a ticket to another team

**One ticket per blocker, ever. If a ticket already exists for this need — in any state, open or closed — comment on it instead of opening a new one.**

#### 5a — Search before you create (mandatory — do not skip)

Run this command and read every result title before doing anything else:

```bash
gh issue list --repo SankaiAI/outcomeX --state open --search "3-5 keywords from your intended title"
```

Example: if you want to ask about the agent's underwriting endpoint, search `"underwriting agent endpoint"` — not `"keywords"`.

**If any result covers the same need:**
- Comment on that issue with your additional context
- **Do not create a new ticket. Stop here.**

**If the list is empty or nothing matches:** continue to 5b.

#### 5b — Create the ticket (only if 5a found no match)

```bash
gh issue create \
  --title "[backend → agent] Short description" \
  --label "needs: agent,api-contract" \
  --repo SankaiAI/outcomeX \
  --body "**From:** backend
**To:** agent
**Blocking:** what cannot be built until this is answered

## Request

## Definition of Done"
```

### Step 6 — Open a human decision ticket (spec conflict or PRD change)

Same rule — run the search first, then create only if no match:

```bash
gh issue list --repo SankaiAI/outcomeX --state open --search "keywords from your intended title"
```

```bash
gh issue create \
  --title "[backend → human] Short description of the conflict or proposed change" \
  --label "needs: human" \
  --repo SankaiAI/outcomeX \
  --body "**From:** backend
**Type:** spec-conflict OR prd-change-request
**Blocking:** what cannot be built until this is resolved

## What the current spec says

## What the problem is

## What I propose"
```

Reference issues in commits: `Closes #7`
