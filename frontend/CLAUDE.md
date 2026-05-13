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

## Cross-Team Coordination

Check for open requests assigned to you at the start of every session:

```bash
gh issue list --label "needs: frontend" --state open
gh issue view <number>
```

When you need something from another team:

```bash
gh issue create \
  --title "[frontend → backend] Short description" \
  --label "needs: backend,api-contract" \
  --body "**From:** frontend
**To:** backend
**Blocking:** what cannot be built until this is answered

## Request

## Definition of Done"
```

When you finish a request assigned to you:

```bash
gh issue comment <number> --body "Done. Summary of what was built or decided."
gh issue close <number>
```

Reference issues in commits: `Closes #14`
