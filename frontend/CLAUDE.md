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
8. One ticket per blocker, ever. Never open a second ticket for the same need. If you are unsure whether one exists, search first — opening duplicates is worse than missing a ticket.
9. Prefer a documented assumption over a ticket. Only ticket when you genuinely cannot proceed without another component's help.
10. Never edit another component's PRD or README. Raise `needs: human` if you believe a change is needed — the human decides.

---

## Cross-Team Coordination

Use the built-in skills — do not implement the ticket workflow manually:

- **To claim and resolve a ticket assigned to you:** `/resolve-ticket [issue-number]`
- **To submit a ticket to another team:** `/submit-ticket [target-team] short description`

The skills handle gh auth (bash and PowerShell), duplicate prevention, board moves, and the correct templates.

Reference issues in your commits: `Closes #14`
