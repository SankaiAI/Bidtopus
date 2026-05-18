# OutcomeX

**Performance-paid AI agent for Meta Ads. Brands pay only when the agent delivers the contracted ROAS. Settled in USDC on Arc.**

Agora Agents Hackathon · Canteen × Circle · May 11–25, 2026

---

## What It Does

A merchant offers a USDC success fee for a measurable marketing target (e.g. ROAS >= 2.0 within 7 days). The AI agent underwrites the contract using ML, negotiates terms, executes a Meta Ads strategy, monitors performance, and receives payment only if the agreed outcome is achieved. Settlement is trustless — USDC is held in escrow on Arc and released or refunded by a smart contract.

---

## How It Works

### The Core Concept: A Risk-Sharing Economic Agent

```mermaid
flowchart LR
    M["🏪 Merchant\n'Hit ROAS 2.0x\nin 7 days or I don't pay'"]

    subgraph Agent["OutcomeX Agent"]
        direction LR
        ML["ML\nUnderwrites risk\n→ 68% prob of success"]
        LLM1["LLM\nNegotiates terms\n→ 'Accept at 2.0x ROAS'"]
        META["Meta Ads\nExecutes 24/7\n→ $75/day budget"]
        RES["Resolution\nSettles on-chain\n→ ROAS 2.25x ≥ 2.0x ✓"]
    end

    ESC["🔐 Arc Escrow\nUSDC locked / released\nCode enforces the guarantee — not trust"]

    M --> ML --> LLM1 --> META --> RES --> ESC
```

### Full Contract Lifecycle

```mermaid
sequenceDiagram
    actor Merchant
    participant OutcomeX
    participant Arc/Meta

    Note over Merchant,OutcomeX: 1. NEGOTIATE
    Merchant->>OutcomeX: "Hit ROAS 2.0x in 7 days"
    OutcomeX->>OutcomeX: Claude negotiates & locks terms
    Note right of OutcomeX: Contract created

    Note over Merchant,OutcomeX: 2. UNDERWRITE
    Merchant->>OutcomeX: Click "Underwrite"
    OutcomeX->>OutcomeX: ML evaluates historical ROAS,<br/>spend, target, time window, AOV
    Note right of OutcomeX: prob: 0.68 · risk: medium · rec: accept

    Note over Merchant,OutcomeX: 3. AGENT OFFER
    OutcomeX-->>Merchant: accept / counteroffer / reject<br/>+ plain-language explanation

    Note over Merchant,Arc/Meta: 4. ACCEPT + FUND ESCROW
    Merchant->>Arc/Meta: Accept offer (Circle App Kit)
    Arc/Meta->>Arc/Meta: USDC locked on Arc
    Note right of Arc/Meta: fund tx_hash [on-chain ✓]

    Note over Merchant,OutcomeX: 5. STRATEGY GENERATION
    OutcomeX-->>Merchant: Strategy plan<br/>(campaign structure, audiences, budget)
    Note over Merchant,OutcomeX: 6. MERCHANT APPROVES
    Merchant->>OutcomeX: Approve strategy

    Note over OutcomeX,Arc/Meta: 7. EXECUTE ADS
    OutcomeX->>Arc/Meta: Meta Ads MCP (mcp.facebook.com/ads)<br/>create_campaign · create_ad_set · set_budget
    Arc/Meta-->>OutcomeX: Campaign live on Meta

    Note over Merchant,Arc/Meta: 8. LIVE MONITORING (every 24h)
    loop Every 24h while Active
        Arc/Meta-->>OutcomeX: Real spend / revenue data
        OutcomeX->>OutcomeX: ML forecast: predicted ROAS,<br/>success probability, on_track / at_risk
        OutcomeX-->>Merchant: Live dashboard update
    end

    Note over OutcomeX,Arc/Meta: 9. RESOLUTION & SETTLEMENT
    OutcomeX->>OutcomeX: spend ≥ min AND roas ≥ target AND window elapsed
    OutcomeX->>Arc/Meta: release() or refund()
    Note right of Arc/Meta: settlement tx_hash [on-chain ✓]
```

### Contract Status Flow

```mermaid
stateDiagram-v2
    [*] --> Negotiating

    Negotiating --> Created : Claude agrees terms with merchant

    Created --> Underwriting : ML underwrites → success probability

    Underwriting --> Offered : LLM generates accept / counteroffer / reject

    Offered --> FundedPending : Merchant accepts offer
    Offered --> [*] : Merchant declines

    FundedPending --> Funded : Circle App Kit → Arc escrow funded on-chain

    Funded --> Active : LLM generates strategy → merchant approves

    Active --> Active : ML monitoring tick every 24h
    Active --> Settled : After time window\ndeterministic resolution\n→ Arc release or refund

    Settled --> [*]
```

### The 5 Autonomous Decisions

```mermaid
flowchart TD
    D1["**Decision 1 — ML Underwrites**\nEvaluates 9 features across merchant history\n→ 68% probability of success\n→ accept / counteroffer / reject"]

    D2["**Decision 2 — LLM Negotiates**\nClaude reasons about fee vs. risk vs. window\n→ 'Accept at 2.0x ROAS. Here's why...'\n→ accept / counteroffer / reject"]

    D3["**Decision 3 — LLM Strategizes**\nBuilds Meta Ads plan with extended thinking\n→ 'Retargeting, $75/day, warm audiences'\n→ merchant approves before any action"]

    D4["**Decision 4 — ML Forecasts Live** *(every 24h)*\nExtrapolates ROAS trajectory from live data\n→ 'Day 4: ROAS 1.9x, on track for 2.2x by day 7'\n→ on_track / at_risk / off_track"]

    D5["**Decision 5 — Engine Settles** *(deterministic)*\nPure logic — no LLM, no ML\nROAS 2.25x ≥ 2.0x ✓ · Spend $545 ≥ $500 ✓\n→ release USDC to agent or refund to merchant"]

    D1 --> D2 --> D3 --> D4 --> D5

    style D5 fill:#d4edda,stroke:#28a745
```

### How ML and LLM Work Together

```mermaid
flowchart LR
    subgraph Input["Merchant Input"]
        I["target_roas: 2.0\nmin_spend: $500\ntime_window: 7 days\ncampaign_mode: new\nhist_roas_7d: 1.8\navg_daily_spend: $80"]
    end

    subgraph ML["ML Layer"]
        M1["Risk model evaluates\n9 features from contract\nterms + account history"]
        M2["Output:\nprobability: 0.68\nrisk_level: medium\nrec: accept\nfee: $100"]
        M1 --> M2
    end

    subgraph LLM["LLM Layer"]
        L1["Claude with extended thinking\nreasons about fee vs. risk\nvs. window tradeoffs"]
        L2["Output (structured):\noffer_type\nmessage to merchant\nrevised terms if counteroffer"]
        L1 --> L2
    end

    Input --> ML --> LLM
```

### Why USDC & Circle

Performance contracts require a settlement currency that is:
- **Stable** — the merchant's locked fee doesn't change value between signing and settlement
- **Programmable** — a smart contract can hold, release, or refund it without a human intermediary
- **Regulated and trusted** — merchants won't lock real money into a token they don't recognize

USDC is the answer to all three. It is the leading regulated digital dollar — fully backed 1:1 by cash and short-term US Treasuries, with monthly third-party attestations published by Circle. Unlike algorithmic stablecoins, USDC has never broken its peg. Unlike USDT, Circle operates under US money transmission regulation and publishes full reserve transparency.

Arc is Circle's purpose-built L1 blockchain. USDC is Arc's native currency — every transaction (funding, release, refund) is denominated in USDC, including gas fees via Paymaster. There is no volatile token in the system. A merchant who funds a $200 USDC escrow on Monday will see exactly $200 USDC released or refunded at settlement — no slippage, no gas surprises, no exchange rate risk.

This is why OutcomeX is built on Circle infrastructure rather than a general-purpose chain: the entire stack — stablecoin, wallets, gas, escrow — is unified under one regulated, dollar-denominated system that any ecommerce merchant can understand.

### Circle Stack

| Circle Product | How OutcomeX Uses It | Lifecycle Step |
|---|---|---|
| **Arc Escrow** | USDC locked at contract signing. Released on success, refunded on failure. Code enforces the guarantee — not the agent's word. | Step 4: Fund · Step 9: Settle |
| **Circle Wallets** | Agent's receiving wallet. Funded by Arc escrow on success. Automated HSM-backed key management — agent never touches raw keys. | Step 9: Success path |
| **Paymaster** | All on-chain transactions (fund, release, refund) paid in USDC. No volatile gas token. Merchant pays in USDC, agent earns in USDC — fees are invisible. | Steps 4, 9 |
| **App Kit** | Drop-in wallet component in the merchant's browser. One-click USDC funding. No MetaMask required. | Step 4: Fund Escrow |
| **USYC** *(roadmap)* | Park idle escrowed USDC in yield while contract is Active. Convert back to USDC at resolution. Merchant capital earns while the agent works. | Active (days 1–7) |

### Why Arc Makes This Possible

```mermaid
flowchart LR
    subgraph ETH["❌ Ethereum Mainnet"]
        direction TB
        E1["Gas: $5–30 per tx"]
        E2["Finality: minutes / hours"]
        E3["$100 contract:\ngas = 5–30% of fee\n→ DESTROYS unit economics"]
    end

    subgraph ARC["✅ Arc (Circle L1)"]
        direction TB
        A1["Gas: ~$0.01 per tx (USDC)"]
        A2["Finality: sub-second, deterministic"]
        A3["$100 contract:\ngas = 0.01% of fee\n→ VIABLE at any contract size"]
    end

    RESULT["Performance-based AI ads\nfor SMBs works at $50 contracts"]

    ETH -. "not viable" .-> RESULT
    ARC -- "unlocks" --> RESULT

    style ETH fill:#fff0f0,stroke:#dc3545
    style ARC fill:#f0fff0,stroke:#28a745
```

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
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (from Clerk dashboard — safe to expose) |
| `CLERK_SECRET_KEY` | Clerk secret key — Next.js server-side only, never sent to browser |

### backend/ + agent/
| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon pooled connection string (copy the **pooled** URL from Neon dashboard) |
| `CLERK_SECRET_KEY` | Clerk secret key — used by `clerk-backend-api` to verify JWTs on every request |
| `ANTHROPIC_API_KEY` | Claude API key for LLM negotiation and strategy generation |
| `ARC_RPC_URL` | Arc testnet RPC endpoint (from ARC CLI setup) |
| `ESCROW_CONTRACT_ADDRESS` | Deployed Arc escrow contract address (from contracts/ deploy) |
| `SETTLER_PRIVATE_KEY` | Private key for the authorized settler wallet (use Circle Wallets in production) |
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

## New Developer Onboarding

Everything you need after cloning the repo.

### 1. Clone and open your component

```bash
git clone https://github.com/SankaiAI/outcomeX.git
cd outcomeX
```

Open **only your component folder** in VS Code — Claude Code reads the `CLAUDE.md` in your working directory to know what you own and how to behave.

### 2. Install Claude Code

```bash
npm install -g @anthropic/claude-code
```

Authenticate with your Anthropic account when prompted.

### 3. Install GitHub CLI and authenticate

**Windows:**
```bash
winget install --id GitHub.cli
```
**Mac:**
```bash
brew install gh
```

Then authenticate:
```bash
gh auth login
# Choose: GitHub.com → HTTPS → Login with a web browser
```

This also sets up `git credential fill` which the CLAUDE.md session setup relies on.

### 4. Get access to the GitHub project board

Ask the repo owner to invite you to [github.com/users/SankaiAI/projects/2](https://github.com/users/SankaiAI/projects/2) so you can monitor tickets.

### 5. Start your Claude Code session

Open your component folder in VS Code, open Claude Code, and say:

> "Check for your tickets"

Claude will read your `CLAUDE.md`, run the setup, and report any open tickets assigned to your component.

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

## License

Copyright (C) 2026 SankaiAI

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See [LICENSE](LICENSE) for details.
