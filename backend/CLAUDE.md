# CLAUDE.md — Backend

You own everything inside `backend/`. You build the FastAPI API and database layer. You route requests, enforce state gates, persist contract state, and call the agent. You do not contain business logic — that lives in the agent.

Read [README.md](README.md) for engineering principles. Read [PRD.md](PRD.md) for full requirements.

---

## Non-Negotiable Rules

1. Every state-transition endpoint checks pre-conditions before calling the agent. If the gate fails, return 400. No agent call happens.
2. Ownership check on every `/contracts/:id/*` endpoint. Merchant A must never touch Merchant B's contract.
3. The agent is called through a single import boundary only. No route or service file imports directly from `agent/`.
4. Dual-write on every notable action: internal observability store and merchant UI store. Never conflate them.
5. Resolution is idempotent. Check for an existing resolution before acting — network retries must be safe.
6. Sanitize LLM output before writing to the merchant message store.
7. Rate-limit all LLM-calling endpoints.

---

## Cross-Team Coordination

### Setup — run this once at the start of every session

```bash
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n" | git credential fill 2>/dev/null | grep password | cut -d= -f2)
```

This loads your GitHub token so all `gh` commands below work without separate auth.

---

### Step 1 — Check for tickets assigned to you

```bash
gh issue list --label "needs: backend" --state open --repo SankaiAI/outcomeX
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
  --title "[backend → agent] Short description" \
  --label "needs: agent,api-contract" \
  --repo SankaiAI/outcomeX \
  --body "**From:** backend
**To:** agent
**Blocking:** what cannot be built until this is answered

## Request

## Definition of Done"
```

Reference issues in commits: `Closes #7`
