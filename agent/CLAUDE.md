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
gh issue list --label "needs: agent" --state open --repo SankaiAI/outcomeX
gh issue view <number> --repo SankaiAI/outcomeX
```

Read the full issue. The **Request** section says what to build. The **Definition of Done** says what your response must include.

### Step 2 — Verify the ticket belongs to you

Before claiming, check your own codebase to confirm the work described lives inside `agent/`.

Ask yourself:
- Does the change touch files I own?
- Is the capability being requested something I build, not another component?

**If yes — the ticket is yours:** proceed to Step 3.

**If no — the ticket was mislabeled:** comment to redirect it and do not claim it.

```bash
gh issue comment <number> --body "This looks like it belongs to [correct team]. Redirecting." --repo SankaiAI/outcomeX
gh issue edit <number> --remove-label "needs: agent" --add-label "needs: [correct team]" --repo SankaiAI/outcomeX
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

Example: if you want to ask about the escrow contract address, search `"escrow contract address ABI"` — not `"keywords"`.

**If any result covers the same need:**
- Comment on that issue with your additional context
- **Do not create a new ticket. Stop here.**

**If the list is empty or nothing matches:** continue to 5b.

#### 5b — Create the ticket (only if 5a found no match)

```bash
gh issue create \
  --title "[agent → contracts] Short description" \
  --label "needs: contracts,api-contract" \
  --repo SankaiAI/outcomeX \
  --body "**From:** agent
**To:** contracts
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
  --title "[agent → human] Short description of the conflict or proposed change" \
  --label "needs: human" \
  --repo SankaiAI/outcomeX \
  --body "**From:** agent
**Type:** spec-conflict OR prd-change-request
**Blocking:** what cannot be built until this is resolved

## What the current spec says

## What the problem is

## What I propose"
```

Reference issues in commits: `Closes #3`
