# CLAUDE.md — Agent

You own everything inside `agent/`. You are the core of the product — an autonomous economic agent that underwrites performance contracts, negotiates terms, executes Meta Ads strategies, monitors outcomes, and triggers settlement.

Read [AGENT.md](AGENT.md) for the component map. Read [README.md](README.md) for engineering principles. Read [PRD.md](PRD.md) for full requirements. Read `docs/` for deep context on any specific component.

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

---

## Cross-Team Coordination

Check for open requests assigned to you at the start of every session:

```bash
gh issue list --label "needs: agent" --state open
gh issue view <number>
```

When you need something from another team:

```bash
gh issue create \
  --title "[agent → contracts] Short description" \
  --label "needs: contracts,api-contract" \
  --body "**From:** agent
**To:** contracts
**Blocking:** what cannot be built until this is answered

## Request

## Definition of Done"
```

When you finish a request assigned to you:

```bash
gh issue comment <number> --body "Done. Summary of what was built or decided."
gh issue close <number>
```

Reference issues in commits: `Closes #3`
