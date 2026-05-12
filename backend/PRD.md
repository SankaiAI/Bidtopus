# OutcomeX — Backend Sub-PRD
**Version 1.1 | Hackathon MVP**

---

## 1. Purpose

The backend is the API and data layer of OutcomeX. It sits between the frontend and the agent. Its job is to expose a clean REST API to the frontend, persist all contract lifecycle state to the database, route work to the agent at the right moments, and ensure every state transition is logged and auditable.

The backend contains no business logic of its own. It does not decide whether to accept a contract, generate a strategy, or settle a payment — those belong to the agent. The backend routes, persists, and exposes.

---

## 2. Recommended Tech Stack

| Concern | Technology |
|---|---|
| API framework | FastAPI (Python) — preferred for ML integration |
| Database | PostgreSQL via Supabase |
| ORM | SQLAlchemy or Supabase Python client |
| Auth | Wallet-based session (sign message) or lightweight JWT |
| Arc testnet access | ARC CLI (`uv tool install git+https://github.com/the-canteen-dev/ARC-cli`) — provides RPC access to Canteen-hosted Arc testnet |
| Circle API | Circle Developer APIs for Wallets and Paymaster integration |

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

All endpoints are prefixed `/api`. The backend must implement all 10 of the following:

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

---

## 5. Data Models

### users
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| role | string | merchant, agent |
| wallet_address | string | For USDC escrow and settlement |
| email | string | Optional |
| created_at | timestamp | |

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

For MVP, wallet-based session is sufficient:
- Merchant signs a message with their wallet to authenticate
- Session token issued and attached to all subsequent requests
- Endpoints that trigger fund movement or execution are protected

---

## 8. Safety & Trust Rules

- No escrow funding endpoint proceeds without a valid prior `agent-offer` record in state `accepted`
- No `execute-ads-actions` call proceeds without `strategy_plans.approval_status = approved`
- No `resolve` call proceeds unless contract status is `Active` and the evaluation window has closed
- All settlement triggers are logged with the on-chain tx hash before the backend marks the contract as `Settled`

---

## 9. MVP Acceptance Criteria (Backend)

- [ ] All 10 API endpoints are implemented and return correct responses.
- [ ] All 8 data models are persisted correctly across the full contract lifecycle.
- [ ] Contract status advances correctly through each state in sequence.
- [ ] Audit trail captures every major state transition.
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
