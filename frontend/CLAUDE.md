# CLAUDE.md — Frontend

You own everything inside `frontend/`. You build the merchant-facing web app. You render state from the backend — you do not contain business logic.

Read [README.md](README.md) for engineering principles. Read [PRD.md](PRD.md) for full requirements.

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

### Step 1 — Check for tickets assigned to you

```bash
gh issue list --label "needs: frontend" --state open --repo SankaiAI/outcomeX
gh issue view <number> --repo SankaiAI/outcomeX
```

Read the full issue before starting. The **Request** section says what to build. The **Definition of Done** says what your response must include.

### Step 2 — Claim the ticket when you start working

```bash
gh issue comment <number> --body "Picking this up now." --repo SankaiAI/outcomeX
gh issue edit <number> --add-label "status: in-progress" --repo SankaiAI/outcomeX
```

This signals to the human monitor that the ticket is active.

### Step 3 — Close the ticket when done

```bash
gh issue comment <number> --body "Done. [your answer or summary of what was built]" --repo SankaiAI/outcomeX
gh issue close <number> --repo SankaiAI/outcomeX
```

Closing automatically moves the card to **Done** on the project board. The requester sees your comment as the answer.

---

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
