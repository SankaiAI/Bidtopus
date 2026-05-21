# Bidtopus — Backend Sub-PRD
**Version 1.1 | Hackathon MVP**

---

## 1. Purpose

The backend is the API and data layer of Bidtopus. It sits between the frontend and the agent. Its job is to expose a clean REST API to the frontend, persist all contract lifecycle state to the database, route work to the agent at the right moments, and ensure every state transition is logged and auditable.

The backend contains no business logic of its own. It does not decide whether to accept a contract, generate a strategy, or settle a payment — those belong to the agent. The backend routes, persists, and exposes.

---

## 2. Recommended Tech Stack

| Concern | Technology |
|---|---|
| API framework | FastAPI (Python) — preferred for ML integration |
| Database | **Neon** — serverless PostgreSQL; branching per developer, scale-to-zero, Vercel-native |
| ORM | SQLAlchemy with `psycopg2` (use Neon's **pooled** connection string) |
| Auth | **Clerk** — JWT-based identity; merchants log in via email/Google; verified in FastAPI via `clerk-backend-api` |
| Arc testnet access | ARC CLI (`uv tool install git+https://github.com/the-canteen-dev/ARC-cli`) — provides RPC access to Canteen-hosted Arc testnet |
| Circle API | Circle Developer APIs for Wallets and Paymaster integration |

**On Clerk + Neon:**
- **Clerk** handles all merchant identity (sign-up, sign-in, JWTs). The wallet connection (Circle App Kit) is a separate step for USDC operations only — not for authentication.
- **Neon** is a drop-in PostgreSQL replacement. All SQLAlchemy models work unchanged. Use the **pooled** connection string from the Neon dashboard for the FastAPI app. Use database branching — each developer works on their own branch, migrations never conflict.

---

## 3. Contract Status State Machine

Every performance contract moves through these states. The backend is the source of truth for current status.

```
Created → Funded → Active → Resolved (Success | Failure) → Settled
```

| Status | Meaning |
|---|---|
| Created | Contract submitted by merchant; underwriting not yet run |
| Funded | Merchant approved agent offer and escrowed USDC |
| Active | Agent is executing strategy and monitoring performance |
| Resolved | Evaluation window closed; outcome determined |
| Settled | USDC released or refunded on-chain |

---

## 4. API Endpoints

All endpoints are prefixed `/api`. The backend must implement all 14 of the following:

**Contract lifecycle endpoints (10):**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/contracts` | Create a new performance contract |
| POST | `/api/contracts/:id/underwrite` | Trigger the ML underwriting model via agent |
| POST | `/api/contracts/:id/agent-offer` | Trigger LLM to generate accept/counter/reject offer |
| POST | `/api/contracts/:id/accept` | Merchant accepts the agent's final offer; status → Funded-pending |
| POST | `/api/contracts/:id/fund-escrow` | Confirm USDC has been escrowed on Arc; status → Funded |
| POST | `/api/contracts/:id/generate-strategy` | Trigger agent to generate Meta Ads strategy plan |
| POST | `/api/contracts/:id/approve-execution` | Merchant approves strategy; status → Active |
| POST | `/api/contracts/:id/execute-ads-actions` | Agent executes approved ad actions via Meta Ads adapter |
| GET | `/api/contracts/:id/performance` | Return latest performance snapshot |
| POST | `/api/contracts/:id/resolve` | Run deterministic resolution; trigger USDC settlement |

**Per-action approval endpoints (3):**

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/contracts/:id/actions/:action_id/approve` | Merchant approves one `approval_request` card; triggers execution when all cards for a plan are approved |
| POST | `/api/contracts/:id/actions/:action_id/decline` | Merchant declines one card; card status → `declined`; other cards unaffected |
| GET | `/api/contracts/:id/pending-actions` | Return count of pending approval cards; used by frontend for badge and notification |

**Message and streaming endpoints (4):**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/contracts/:id/messages` | Return full ordered message timeline (workspace restore) |
| POST | `/api/contracts/:id/messages` | Merchant sends a chat message; persists + triggers streaming reply |
| POST | `/api/contracts/:id/chat/stream` | Stream LLM chat Q&A response (SSE — text/event-stream) |
| GET | `/api/contracts/:id/events` | SSE stream of live agent updates, approval requests, snapshots |

---

## 5. Data Models

### users
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| clerk_user_id | string | **UNIQUE NOT NULL** — Clerk's user ID; primary identity source |
| email | string | Synced from Clerk on first login |
| wallet_address | string | **Nullable** — populated when merchant connects wallet on Escrow Funding screen |
| approval_mode | string | `manual` (default) / `auto` — controls monitoring tick execution; stored on user, not per-contract |
| meta_ads_account_id | string | **Nullable** — connected Meta Ads account ID (format: `act_XXXXXXXXX`); set via Settings sidebar selector, not during negotiation |
| created_at | timestamp | |

**Auth model:** Clerk manages identity (email/Google login). `clerk_user_id` is the join key between Clerk and the backend DB. `wallet_address` is populated separately when the merchant connects their wallet for USDC operations. A merchant can create a contract and view their dashboard before ever connecting a wallet — the wallet is only required at the Escrow Funding step.

### performance_contracts
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| merchant_id | UUID | FK → users |
| target_metric | string | "ROAS" for MVP |
| threshold | float | e.g. 2.0 |
| minimum_spend | float | e.g. 500 |
| time_window_days | int | e.g. 7 |
| success_fee_usdc | float | e.g. 100 |
| campaign_mode | string | "new" or "optimize" |
| campaign_goal | string | Free text product/campaign description |
| account_context | json | Ad account ID and any available account data |
| status | string | State machine: Created → Funded → Active → Resolved → Settled |
| created_at | timestamp | |
| funded_at | timestamp | |
| resolved_at | timestamp | |

### underwriting_results
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| contract_id | UUID | FK → performance_contracts |
| success_probability | float | 0–1 |
| risk_level | string | low / medium / high |
| expected_roas_range | float[] | [min, max] |
| recommendation | string | accept / counteroffer / reject |
| recommended_fee_usdc | float | Agent's fee recommendation |
| created_at | timestamp | |

### agent_offers
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| contract_id | UUID | FK → performance_contracts |
| offer_type | string | accept / counteroffer / reject |
| message | text | LLM-generated merchant-facing explanation |
| revised_threshold | float | Populated if counteroffer |
| revised_fee_usdc | float | Populated if counteroffer |
| revised_time_window_days | int | Populated if counteroffer |
| created_at | timestamp | |

### escrow_records
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| contract_id | UUID | FK → performance_contracts |
| chain_contract_id | string | On-chain escrow contract address |
| tx_hash | string | Funding transaction hash |
| amount_usdc | float | Amount escrowed |
| status | string | pending / funded / released / refunded |
| settlement_tx_hash | string | Settlement transaction hash |
| created_at | timestamp | |

### strategy_plans
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| contract_id | UUID | FK → performance_contracts |
| summary | text | LLM-generated plain language summary |
| planned_actions | json | Structured list of ad actions |
| approval_status | string | pending / approved / declined |
| approved_at | timestamp | |
| execution_receipts | json | **Nullable** — MCP return values written after Day 1 execution: `{campaign_id, ad_set_ids, creative_ids}`. Required by the 24h monitoring tick to reference existing campaigns when calling MCP. |

### performance_snapshots
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| contract_id | UUID | FK → performance_contracts |
| timestamp | timestamp | When snapshot was taken |
| spend | float | Total spend to date |
| revenue | float | Total revenue attributed |
| roas | float | spend > 0 ? revenue / spend : null |
| success_probability | float | ML live forecast at this moment |

### resolution_records
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| contract_id | UUID | FK → performance_contracts |
| final_spend | float | |
| final_revenue | float | |
| final_roas | float | |
| outcome | string | success / failure |
| settlement_tx_hash | string | On-chain settlement transaction |
| resolved_at | timestamp | |

### contract_messages
The source of truth for the merchant-facing chat timeline. Every event visible in the UI is a row in this table. On workspace reload, the frontend hydrates the full timeline from this table in a single query.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| contract_id | UUID | FK → performance_contracts — indexed |
| role | string | `agent` / `merchant` / `system` |
| type | string | `message` / `daily_update` / `approval_request` / `system_event` |
| content | text | Plain-language text shown in the UI |
| metadata | json | Structured data for rendering cards (ROAS, action details, strategy_id, tx_hash) |
| status | string | `pending` / `approved` / `declined` / `expired` / null — only used for `approval_request` rows |
| expires_at | timestamptz | **Nullable** — deadline for monitoring-tick approval cards (23h window); null for initial strategy cards |
| created_at | timestamptz | Indexed — timeline is ordered by this |

**Type reference:**

| `type` | `role` | Renders as | `status` field used? |
|---|---|---|---|
| `system_event` | `system` | Grey banner (e.g. "Contract created · Escrow funded") | No |
| `message` | `agent` | Agent chat bubble | No |
| `message` | `merchant` | Merchant chat bubble | No |
| `daily_update` | `agent` | AGENT UPDATE · DAY N card with ROAS and forecast | No |
| `approval_request` | `agent` | Action card with Approve / Decline buttons | Yes — `pending` → `approved` / `declined` / `expired` |

### audit_events
The internal observability store. Every agent component call is logged here — ML inputs/outputs, LLM decisions, adapter calls, crash recovery checkpoints. Not shown directly to the merchant; read by the agent for chat context and crash recovery.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| contract_id | UUID | FK → performance_contracts — indexed |
| component | string | `ml_underwriting` / `llm_negotiation` / `llm_strategy` / `meta_ads` / `arc_escrow` / `resolution` |
| event_type | string | `intent` / `result` / `snapshot` / `error` |
| payload | json | Full inputs + outputs at this moment |
| created_at | timestamptz | Indexed |

**Separation of concerns:**

| Table | Written by | Read by | Purpose |
|---|---|---|---|
| `contract_messages` | Backend (on state transitions) + Agent (on notable actions) | Frontend (timeline hydration), SSE stream | What the merchant sees |
| `audit_events` | Agent (every component call) | Agent orchestrator (crash recovery, chat context) | Internal observability |

---

## 6. Audit Trail

Every significant state transition must be logged with a timestamp and actor. Minimum events to log:

- Contract created
- Underwriting triggered and result received
- Agent offer generated
- Merchant accepted offer
- Escrow funded (with tx hash)
- Strategy generated
- Merchant approved execution
- Ad actions executed
- Performance snapshot recorded
- Outcome resolved
- Settlement triggered (with tx hash)

This log must be queryable per contract and is the evidence layer for disputes or demo replay.

---

## 7. Auth & Session

Authentication is handled by **Clerk**. The backend verifies Clerk JWTs on every protected request.

### How it works

1. Merchant signs in via Clerk (email/Google) on the frontend — Clerk issues a signed JWT
2. Frontend attaches the JWT as `Authorization: Bearer <token>` on every API request
3. Backend verifies the JWT using Clerk's JWKS endpoint via `clerk-backend-api`
4. The verified `clerk_user_id` is used to look up or create the user in the `users` table

### FastAPI Clerk middleware

```python
# auth/clerk.py
import os
from clerk_backend_api import Clerk
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer

clerk   = Clerk(bearer_auth=os.getenv("CLERK_SECRET_KEY"))
bearer  = HTTPBearer()

async def get_current_user(token=Depends(bearer), db: Session = Depends(get_db)):
    try:
        claims = clerk.verify_token(token.credentials)
    except Exception:
        raise HTTPException(401, "Invalid or expired Clerk session token")

    # Upsert user on first login
    user = repo.get_or_create_user(db, clerk_user_id=claims["sub"], email=claims.get("email"))
    return user
```

### Wallet connection (separate from auth)

Wallet connection happens at the Escrow Funding screen — not at login. When the merchant connects their wallet via Circle App Kit, the frontend calls:

```
POST /api/users/me/wallet
body: { "wallet_address": "0x..." }
```

This endpoint stores the wallet address on the user record. It does **not** require a wallet signature for auth — that's handled by Clerk.

### Protected endpoints

All `/api/contracts/*` endpoints require `Depends(get_current_user)`. The fund-escrow and resolve endpoints additionally check that `current_user.wallet_address` is set.

### Required environment variables

| Variable | Purpose |
|---|---|
| `CLERK_SECRET_KEY` | Server-side JWT verification (`sk_live_...` or `sk_test_...`) |

---

## 8. Safety & Trust Rules

- No escrow funding endpoint proceeds without a valid prior `agent-offer` record in state `accepted`
- No `execute-ads-actions` call proceeds without `strategy_plans.approval_status = approved`
- No `resolve` call proceeds unless contract status is `Active` and the evaluation window has closed
- All settlement triggers are logged with the on-chain tx hash before the backend marks the contract as `Settled`

---

## 8a. Security Rules (Backend)

### Ownership Check on Every Contract Endpoint

Every endpoint that operates on a contract must verify the requesting merchant owns that contract. Missing this check means Merchant A can trigger resolution — or read data — on Merchant B's contract.

```python
def require_contract_owner(contract_id: str, current_user: User, db: Session) -> PerformanceContract:
    contract = repo.get_contract(db, contract_id)
    if contract is None:
        raise HTTPException(404, "Contract not found")
    if contract.merchant_id != current_user.id:
        raise HTTPException(403, "Not authorized for this contract")
    return contract

# Applied to every contract endpoint:
@router.post("/contracts/{contract_id}/resolve")
def resolve(contract_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    contract = require_contract_owner(contract_id, current_user, db)
    # state gate check follows...
```

### Clerk JWT — Primary Auth (Replaces Wallet Signature Auth)

Authentication is delegated to Clerk. Never hand-roll JWT parsing. The `get_current_user` dependency verifies the Clerk token on every protected request.

```python
# All identity verified by Clerk — apply to every protected endpoint
@router.post("/contracts/{contract_id}/resolve")
def resolve(
    contract_id: str,
    current_user: User = Depends(get_current_user),  # Clerk JWT verified here
    db: Session = Depends(get_db)
):
    contract = require_contract_owner(contract_id, current_user, db)
    ...
```

### Wallet Address — Verified Only at Wallet Connect Step

Wallet addresses are verified with a signature only at the `POST /users/me/wallet` endpoint. This is the one place where `eth_account` is used — not for login, but to prove wallet ownership before storing the address.

```python
from eth_account import Account
from eth_account.messages import encode_defunct

@router.post("/users/me/wallet")
def connect_wallet(body: WalletConnectRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    msg       = encode_defunct(text=f"Connect wallet to Bidtopus {current_user.clerk_user_id}")
    recovered = Account.recover_message(msg, signature=body.signature)
    if recovered.lower() != body.wallet_address.lower():
        raise HTTPException(400, "Wallet signature verification failed")
    repo.update_wallet_address(db, current_user.id, body.wallet_address)
    return {"wallet_address": body.wallet_address}
```

### `resolve` Must Be Idempotent — Prevent Double-Settlement

Network retries or double-clicks must not trigger two on-chain settlement calls.

```python
@router.post("/contracts/{contract_id}/resolve")
def resolve(contract_id: str, ...):
    # Idempotency check FIRST — before any agent work
    existing = repo.get_resolution(db, contract_id)
    if existing:
        return existing  # return prior result, do not re-run

    contract = require_contract_owner(contract_id, current_user, db)
    # ... state gate checks, then agent call
```

### Rate Limit LLM-Calling Endpoints

Each `/underwrite` + `/agent-offer` cycle incurs real Anthropic API cost. Without rate limiting, a single attacker can exhaust the API budget in minutes.

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/contracts/{contract_id}/underwrite")
@limiter.limit("10/minute")          # per IP
@limiter.limit("3/minute; wallet")   # per authenticated wallet
def underwrite(contract_id: str, ...):
    ...
```

### Sanitize LLM Output Before Storing in `contract_messages`

The `content` field is rendered in the frontend. Strip any HTML tags before storing to prevent stored XSS.

```python
import bleach

def sanitize_llm_output(text: str) -> str:
    # Allow basic markdown-safe characters, strip all HTML tags
    return bleach.clean(text, tags=[], strip=True)

# Applied before every messages_repo.append() call with agent-generated content:
messages_repo.append(db, contract_id, "agent", "message",
    content=sanitize_llm_output(offer.message),
    metadata={...}
)
```

### Secrets Management — Never Commit Secrets

These secrets must never appear in source code or `.env` files committed to git.

| Secret | Risk if leaked |
|---|---|
| `SETTLER_PRIVATE_KEY` | Attacker drains all funded escrows |
| `ANTHROPIC_API_KEY` | Unlimited LLM costs |
| `META_ADS_ACCESS_TOKEN` | Fraudulent ad campaigns run on merchant accounts |
| `CIRCLE_API_KEY` | Access to agent Circle wallet |
| `DATABASE_URL` | Full read/write access to all contract and merchant data |
| `JWT_SECRET` | Forge any merchant session token |

Add a pre-commit hook that blocks commits containing these patterns:

```bash
# .git/hooks/pre-commit
if git diff --cached | grep -E "(SETTLER_PRIVATE_KEY|sk-ant-|ANTHROPIC_API_KEY)" ; then
    echo "ERROR: Potential secret detected in commit. Aborting."
    exit 1
fi
```

Use Railway's encrypted secret store for all production values.

---

## 9. MVP Acceptance Criteria (Backend)

- [ ] All 14 API endpoints are implemented and return correct responses.
- [ ] All 10 data models are persisted correctly across the full contract lifecycle.
- [ ] Contract status advances correctly through each state in sequence.
- [ ] `contract_messages` table is populated at every visible UI event; `GET /messages` reconstructs the full timeline on workspace reload.
- [ ] `audit_events` table captures every agent component call with inputs, outputs, and timestamp; supports the query patterns in `agent/docs/observability.md`.
- [ ] `GET /events` SSE stream delivers new `contract_messages` rows to connected clients within 2–3 seconds of creation.
- [ ] `POST /chat/stream` streams Claude's response token-by-token using `StreamingResponse`.
- [ ] No execution or settlement endpoint can be called out of sequence.

---

## 10. Non-Goals for MVP

- Multi-tenancy or org-level user management
- Webhook / event streaming to frontend (polling is fine for MVP)
- Rate limiting or production-grade API security
- Background job queues (synchronous calls to agent are acceptable)

---

## 11. Judging Context

The backend enables two judging criteria directly:
- **Traction (30%)** — the backend must be deployed and able to handle real merchant contracts during the event window (May 11–25). Plan for a real deployment from the start, not just local dev.
- **Circle tool usage (20%)** — the fund-escrow and resolve endpoints must interact with the real Arc testnet via the ARC CLI. Logging Arc tx hashes in escrow_records and resolution_records is what proves on-chain usage to judges.

---

## 12. Stretch Goals (Backend)

| Goal | What to build |
|---|---|
| CPA tracking | Add `cpa` field to performance_snapshots and resolution logic |
| Multi-agent support | Allow multiple agent_offers per contract; merchant picks one |
| Performance snapshot history | Return full time-series for charting on the dashboard |
| Circle Webhooks | Listen for on-chain events from Arc to update escrow status in real time |

---

## 13. Dependencies

| Needs from | What |
|---|---|
| `agent/` | Underwriting result, LLM offer, strategy plan, live forecast, resolution outcome — called synchronously from backend endpoints |
| `contracts/` | Arc escrow contract address and ABI for the fund-escrow and resolve endpoints |
| `frontend/` | Defines what data shapes each screen needs; align API response format to frontend requirements |
| ARC CLI | RPC access to Arc testnet for on-chain calls |
| Circle Developer APIs | Wallets and Paymaster API keys for agent wallet and fee sponsorship |

---

## 14. Engineering Patterns (Lessons from Anthropic + OpenAI)

### 14.1 Backend as Thin Layer

The backend adds exactly two things: pre-condition checks and persistence. It does not contain business logic. Every endpoint follows this pattern:

```
1. Validate input shape (Pydantic)
2. Check contract state (state gate)
3. Call agent
4. Persist result
5. Return response
```

### 14.2 Layered Architecture — One-Way Dependencies

```
Types → Config → Repo → Service → Routes
```

No layer imports from a layer above it. `routes/` imports from `services/`. `services/` imports from `db/repo.py`. `db/repo.py` imports from `models/`. Never the reverse.

### 14.3 Queryable Audit Log

The `audit_events` table must have indexed `contract_id`, `component`, and `created_at` columns from day 1. The agent reads it for chat Q&A context and crash recovery — not just humans reading logs.

Add a `POST /chat/:contract_id` endpoint that loads recent audit events as Claude context and returns a conversational answer. This is read-only — it never calls the agent's execution path.

### 14.4 State Gate on Every Transition Endpoint

Every endpoint that advances contract state checks pre-conditions in code (not in the LLM prompt). See Section 8 for the full gate reference. Wrong state → 400, no agent work happens.

### 14.5 UI Decoupled from Agent via DB

The frontend polls `GET /contracts/:id/performance` every 30 seconds. It never waits for the agent to run. The agent's background scheduler writes snapshots to DB independently. The backend's performance endpoint just reads the latest snapshot from DB and returns it — no agent call needed.
