# OutcomeX

**Performance-paid AI marketing agent. Merchants pay only when the agent delivers the contracted outcome. Settled in USDC on Arc.**

Agora Agents Hackathon · Canteen × Circle · May 11–25, 2026

---

## What It Does

A merchant offers a USDC success fee for a measurable marketing target (e.g. ROAS >= 2.0 within 7 days). The AI agent underwrites the contract using ML, negotiates terms, executes a Meta Ads strategy, monitors performance, and receives payment only if the agreed outcome is achieved. Settlement is trustless — USDC is held in escrow on Arc and released or refunded by a smart contract.

---

## Repo Structure

```
outcomeX/
├── frontend/     Next.js web app — the merchant-facing UI
├── backend/      FastAPI API + database — routes and persists contract state
├── agent/        AI agent — ML underwriting, LLM negotiation, ads execution, settlement
└── contracts/    Solidity escrow contract — deployed once to Arc testnet
```

Each folder has its own `PRD.md` with full build requirements for that component.

---

## Deployment Topology

Each folder deploys independently. The GitHub repo is shared; the deployment targets are not.

```
frontend/   →  Vercel          (Next.js, auto-deploys on push)
backend/    →  Railway/Render  (FastAPI + agent, Python service)
agent/      →  same service as backend (imported as a local Python module)
contracts/  →  Arc testnet     (one-time deploy via ARC CLI, produces a contract address)
```

---

## Deployment Setup

### frontend/ → Vercel

1. Connect the GitHub repo to Vercel
2. In Vercel project settings, set **Root Directory** to `frontend`
3. Framework preset: **Next.js** (auto-detected)
4. Add environment variables (see below)
5. Every push to `main` auto-deploys

### backend/ + agent/ → Railway (or Render)

`backend/` and `agent/` deploy together as a single Python service. The backend imports agent modules directly — no HTTP between them.

**On Railway:**
1. Create a new project → Deploy from GitHub repo
2. Set **Root Directory** to `backend`
3. Railway auto-detects the Python service via `requirements.txt` or `Pyproject.toml`
4. Add environment variables (see below)
5. Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

**Making agent/ importable from backend/:**
Add a path reference in `backend/` so it can import from `../agent/`, or symlink `agent/` inside `backend/` at deploy time. Simplest approach: add this to the Railway start command or a `Procfile`:
```bash
PYTHONPATH=/app:/app/../agent uvicorn main:app --host 0.0.0.0 --port $PORT
```

### contracts/ → Arc Testnet (one-time)

Contracts are not a running server. They are deployed once and produce a contract address that everything else references.

1. Install the ARC CLI:
   ```bash
   uv tool install git+https://github.com/the-canteen-dev/ARC-cli
   ```
2. Follow Arc testnet setup at https://arc-node.thecanteenapp.com/
3. Run the deployment script from `contracts/`:
   ```bash
   cd contracts
   # deploy script TBD by contracts team
   ```
4. Copy the output contract address into environment variables for `backend/` and `agent/`

Reference docs:
- Arc developer docs: https://docs.arc.network
- Circle developer docs: https://developers.circle.com

---

## Environment Variables

### frontend/
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL of the deployed backend service |
| `NEXT_PUBLIC_ARC_EXPLORER_URL` | Arc block explorer base URL (for tx hash links) |

### backend/ + agent/
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Supabase) |
| `ANTHROPIC_API_KEY` | Claude API key for LLM negotiation and strategy generation |
| `ARC_RPC_URL` | Arc testnet RPC endpoint (from ARC CLI setup) |
| `ESCROW_CONTRACT_ADDRESS` | Deployed Arc escrow contract address (from contracts/ deploy) |
| `SETTLER_PRIVATE_KEY` | Private key for the authorized settler wallet |
| `CIRCLE_API_KEY` | Circle API key for Wallets and Paymaster |
| `META_ADS_ACCESS_TOKEN` | Meta Ads API token (optional — mock adapter used if absent) |

### contracts/ (deploy time only)
| Variable | Description |
|---|---|
| `ARC_RPC_URL` | Arc testnet RPC endpoint |
| `DEPLOYER_PRIVATE_KEY` | Wallet that pays for contract deployment |
| `USDC_TOKEN_ADDRESS` | USDC contract address on Arc testnet |
| `SETTLER_ADDRESS` | Wallet address authorized to call release/refund |

---

## Local Development

Each folder runs independently in local dev. You do not need to run all four at once.

```bash
# Frontend
cd frontend && npm install && npm run dev

# Backend + Agent
cd backend && pip install -r requirements.txt && uvicorn main:app --reload

# Contracts (compile only, no local chain needed for MVP)
cd contracts && # follow contracts/PRD.md
```

For local backend → Arc testnet interaction, point `ARC_RPC_URL` to the Canteen-hosted testnet endpoint from the ARC CLI.

---

## Team

| Area | Folder |
|---|---|
| Frontend | `frontend/` |
| Backend + Agent | `backend/` + `agent/` |
| Smart Contracts | `contracts/` |

---

## Hackathon Submission Checklist

- [ ] Live frontend deployed and publicly accessible
- [ ] Backend deployed and handling real requests
- [ ] Escrow contract live on Arc testnet with a real contract address
- [ ] End-to-end demo: contract → escrow → strategy → monitoring → settlement
- [ ] Real Arc tx hashes visible in the UI (escrow funding + settlement)
- [ ] Pitch video recorded
- [ ] GitHub repo public
- [ ] Submitted via Luma before May 25

---

## Competitive Landscape

OutcomeX sits at an intersection that no single competitor occupies. The table below shows the closest analogs and what each one is missing.

| Platform | What they do | Autonomous AI Execution | Outcome-Based Pricing | On-Chain Escrow | ML Underwriting |
|---|---|---|---|---|---|
| **AdAmigo** | Autonomous AI agent for Meta Ads — manages campaigns 24/7 via natural-language commands, full autopilot mode | ✅ Very high | ❌ Flat subscription | ❌ No | ❌ No |
| **Uniscrow** | Blockchain-based conditional payment platform — buyer defines a KPI, deposits USDC into a smart contract, funds release when an API confirms the KPI was hit | ❌ No agent | ✅ KPI-triggered release | ✅ Yes (Polygon/USDC) | ❌ No |
| **Nobody** | Pre-screens whether a marketing target is achievable using ML before accepting a contract, then prices risk accordingly | ❌ | ❌ | ❌ | ✅ This is OutcomeX's novel contribution |

**AdAmigo:** https://www.adamigo.ai
**Uniscrow:** https://uniscrow.com

### Why OutcomeX is different

OutcomeX combines what each competitor does in isolation:
- **AdAmigo's autonomous execution** — the agent actually runs the Meta Ads campaign
- **Uniscrow's trustless escrow** — USDC is locked and released by a smart contract, not a human
- **ML underwriting that nobody else does** — the agent tells the merchant upfront whether the target is achievable, prices the risk, and can refuse contracts it estimates it will lose

No existing platform does all three. The ML underwriting mechanic — where the agent underwrites its own performance contract before accepting it — is the core differentiator and should be front and center in the demo pitch.

---

## Key Links

| Resource | URL |
|---|---|
| Arc developer docs | https://docs.arc.network |
| Circle developer docs | https://developers.circle.com |
| Canteen Arc node docs | https://arc-node.thecanteenapp.com |
| Hackathon page | https://agora.thecanteenapp.com |
| Canteen Discord | https://discord.gg/TGnyfKh23V |
| Arc builder Discord | https://discord.com/invite/buildonarc |
