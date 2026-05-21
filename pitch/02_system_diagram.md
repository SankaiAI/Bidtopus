# Bidtopus — System Diagram & Architecture

---

## The Core Concept: A Risk-Sharing Economic Agent

```mermaid
flowchart LR
    M["🏪 Merchant\n'Hit ROAS 2.0x\nin 7 days or I don't pay'"]

    subgraph Agent["Bidtopus Agent"]
        direction LR
        ML["ML\nUnderwrites risk\n→ 68% prob of success"]
        LLM1["LLM\nNegotiates terms\n→ 'Accept at 2.0x ROAS'"]
        META["Meta Ads\nExecutes 24/7\n→ $75/day budget"]
        RES["Resolution\nSettles on-chain\n→ ROAS 2.25x ≥ 2.0x ✓"]
    end

    ESC["🔐 Arc Escrow\nUSDC locked / released\nCode enforces the guarantee — not trust"]

    M --> ML --> LLM1 --> META --> RES --> ESC
```

---

## Full Contract Lifecycle Flow

```mermaid
sequenceDiagram
    actor Merchant
    participant Bidtopus
    participant Arc/Meta

    Note over Merchant,Bidtopus: 1. NEGOTIATE
    Merchant->>Bidtopus: "Hit ROAS 2.0x in 7 days"\n(Meta Ads account pre-connected via sidebar)
    Bidtopus->>Bidtopus: Claude negotiates & locks terms
    Note right of Bidtopus: Contract created

    Note over Merchant,Bidtopus: 2. UNDERWRITE
    Merchant->>Bidtopus: Click "Underwrite"
    Bidtopus->>Bidtopus: ML evaluates historical ROAS,<br/>spend, target, time window, AOV
    Note right of Bidtopus: prob: 0.68 · risk: medium · rec: accept

    Note over Merchant,Bidtopus: 3. AGENT OFFER
    Bidtopus-->>Merchant: accept / counteroffer / reject<br/>+ plain-language explanation

    Note over Merchant,Arc/Meta: 4. ACCEPT + FUND ESCROW
    Merchant->>Arc/Meta: Accept offer (Circle App Kit)
    Arc/Meta->>Arc/Meta: USDC locked on Arc
    Note right of Arc/Meta: fund tx_hash [on-chain ✓]

    Note over Merchant,Bidtopus: 5. STRATEGY GENERATION
    Bidtopus->>Arc/Meta: Meta Ads MCP → read existing campaigns,<br/>pixel events, audience performance
    Arc/Meta-->>Bidtopus: Real account data
    Bidtopus-->>Merchant: 4 action cards — campaign · audience · budget · creative<br/>(each grounded in your actual account data)
    Note over Merchant,Bidtopus: 6. MERCHANT APPROVES (per-action)
    Merchant->>Bidtopus: Approve / decline each card independently
    Note right of Bidtopus: All approved → Active

    Note over Bidtopus,Arc/Meta: 7. EXECUTE ADS
    Bidtopus->>Arc/Meta: Meta Ads MCP (mcp.facebook.com/ads)<br/>create_campaign · create_adset · create_ad_creative · create_ad
    Arc/Meta-->>Bidtopus: Campaign live · execution receipts stored<br/>(campaign_id · ad_set_ids · creative_ids)

    Note over Merchant,Arc/Meta: 8. LIVE MONITORING (every 24h)
    loop Every 24h while Active
        Bidtopus->>Arc/Meta: Meta Ads MCP get_adset_insights → ad-set-level ROAS,<br/>spend, CTR, conversion events
        Arc/Meta-->>Bidtopus: Real account performance data
        Bidtopus->>Bidtopus: ML forecast: predicted ROAS, on_track / at_risk<br/>LLM decision: which ad_sets to scale · pause · swap
        Bidtopus-->>Merchant: Daily update + suggested actions
        alt Manual approval mode
            Bidtopus-->>Merchant: Approval cards per action (expires in 23h)
            Merchant->>Bidtopus: Approve / decline each action
            Bidtopus->>Arc/Meta: Execute only approved actions via MCP
        else Auto mode
            Bidtopus->>Arc/Meta: Execute all decisions immediately via MCP
        end
        Note right of Bidtopus: Unanswered cards expire at next tick
    end

    Note over Bidtopus,Arc/Meta: 9. RESOLUTION & SETTLEMENT
    Bidtopus->>Bidtopus: spend ≥ min AND roas ≥ target AND window elapsed
    Bidtopus->>Arc/Meta: Circle Wallets signs release() or refund()
    Note right of Arc/Meta: settlement tx_hash [on-chain ✓]
```

---

## The 5 Autonomous Decisions

These are the five points where Bidtopus *decides*, not just *executes*:

```mermaid
flowchart TD
    D1["**Decision 1 — ML Underwrites**\nEvaluates 9 features across merchant history\n→ 68% probability of success\n→ accept / counteroffer / reject"]

    D2["**Decision 2 — LLM Negotiates**\nClaude with extended thinking reasons about fee vs. risk vs. window\n→ 'Accept at 2.0x ROAS. Here's why...'\n→ reasoning streamed live to merchant\n→ accept / counteroffer / reject"]

    D3["**Decision 3 — LLM Strategizes**\nMCP reads existing campaigns + pixel + audience data first\nBuilds data-driven Meta Ads plan with extended thinking\n→ 'Your warm 30d audience has 2.1x ROAS — scale it, cut cold interest'\n→ brand approves before any action"]

    D4["**Decision 4 — ML + LLM Optimize Live** *(every 24h)*\nML extrapolates ROAS trajectory from real MCP data\n→ 'Day 4: ROAS 1.9x, on track for 2.2x by day 7'\nLLM decides what to adjust based on ad-set breakdown\n→ 'Scale warm_30d · pause cold_interest · swap creative'\n→ approval cards in manual mode · immediate execution in auto"]

    D5["**Decision 5 — Engine Settles** *(deterministic)*\nPure logic — no LLM, no ML\nROAS 2.25x ≥ 2.0x ✓ · Spend $545 ≥ $500 ✓\n→ release USDC to agent or refund to merchant"]

    D1 --> D2 --> D3 --> D4 --> D5

    style D5 fill:#d4edda,stroke:#28a745
```

**The LLM never makes the settlement call.** The resolution engine is deterministic logic — `roas >= target AND spend >= minimum`. This is auditable, tamper-proof, and cannot be influenced by either party. The LLM narrates the result; the math makes the decision.

---

## Circle Stack

| Circle Product | How Bidtopus Uses It | Lifecycle Step |
|---|---|---|
| **Arc Escrow** | USDC locked at contract signing. Released on success, refunded on failure. Code enforces the guarantee — not the agent's word. | Step 4: Fund · Step 9: Settle |
| **Circle Wallets** | Agent's receiving wallet. Funded by Arc escrow on success. Automated HSM-backed key management — agent never touches raw keys. | Step 9: Success path |
| **Paymaster** | All on-chain transactions (fund, release, refund) paid in USDC. No volatile gas token. Merchant pays in USDC, agent earns in USDC — fees are invisible. | Steps 4, 9 |
| **App Kit** | Drop-in wallet component in the merchant's browser. One-click USDC funding. No MetaMask required. | Step 4: Fund Escrow |
| **USYC** *(roadmap)* | Park idle escrowed USDC in yield while contract is Active. Convert back to USDC at resolution. Merchant capital earns while the agent works. | Active (days 1–7) |

---

## Why Arc Makes This Possible

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

A $100 USDC success fee contract on Ethereum mainnet loses 5–30% to gas before either party earns anything. On Arc it loses 0.01%. That is the business model unlock.

---

## How ML and LLM Work Together

```mermaid
flowchart LR
    subgraph Input["Brand Input"]
        I["target_roas: 2.0\nmin_spend: $500\ntime_window: 7 days\ncampaign_mode: optimize\nmeta_ads_account_id: act_123\nhist_roas_7d: 1.8\navg_daily_spend: $80"]
    end

    subgraph MCP["Meta Ads MCP (Strategy only)"]
        MC["Read existing campaigns\nPixel events · Audience ROAS\nCreative performance · Spend pacing"]
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
    MCP --> LLM

    WHY1["Why ML, not rules:\nGeneralizes across brand\nhistories to price forward\nrisk on unseen contract configs"]
    WHY2["Why LLM, not rules:\nExplains tradeoffs in plain\nlanguage and reasons about\nwhat terms make sense"]
    WHYMC["Why MCP:\nStrategy built on real account\ndata — not generic templates.\n'Your warm 30d audience has\n2.1x ROAS. Scale it.'"]

    ML --- WHY1
    LLM --- WHY2
    MCP --- WHYMC

    style WHY1 fill:#f8f9fa,stroke:#adb5bd
    style WHY2 fill:#f8f9fa,stroke:#adb5bd
```

---

## Contract Status Flow

```mermaid
stateDiagram-v2
    [*] --> Negotiating

    Negotiating --> Created : Claude agrees terms with merchant

    Created --> Underwriting : ML underwrites → success probability

    Underwriting --> Offered : LLM generates accept / counteroffer / reject

    Offered --> FundedPending : Merchant accepts offer
    Offered --> [*] : Merchant declines

    FundedPending --> Funded : Circle App Kit → Arc escrow funded on-chain

    Funded --> Active : LLM generates 4 action cards\nMerchant approves each → execution completes

    Active --> Active : ML + LLM monitoring tick every 24h\nManual mode: approval cards per action\nAuto mode: immediate MCP execution
    Active --> Settled : After time window\ndeterministic resolution\n→ Arc release or refund

    Settled --> [*]
```

---

## Competitor Landscape

| | AI Execution | On-chain Escrow | Pay on Outcome | ML Underwriting |
|---|---|---|---|---|
| AdAmigo | ✓ | ✗ | ✗ | ✗ |
| Uniscrow | ✗ | ✓ | ✓ | ✗ |
| Leadzai | Partial | ✗ | ✓ | ✗ |
| Madgicx / Ryze | ✓ | ✗ | ✗ | ✗ |
| **Bidtopus** | **✓** | **✓** | **✓** | **✓** |

No existing platform sits at this intersection.
