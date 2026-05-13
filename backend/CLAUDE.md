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

Check for open requests assigned to you at the start of every session:

```bash
gh issue list --label "needs: backend" --state open
gh issue view <number>
```

When you need something from another team:

```bash
gh issue create \
  --title "[backend → agent] Short description" \
  --label "needs: agent,api-contract" \
  --body "**From:** backend
**To:** agent
**Blocking:** what cannot be built until this is answered

## Request

## Definition of Done"
```

When you finish a request assigned to you:

```bash
gh issue comment <number> --body "Done. Summary of what was built or decided."
gh issue close <number>
```

Reference issues in commits: `Closes #7`
