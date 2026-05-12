# OutcomeX — Contracts

## Purpose
The contracts folder contains the on-chain smart contract that powers the escrow and settlement mechanics. This is what makes OutcomeX trustless: neither the merchant nor the agent can move funds unilaterally — the contract enforces the agreed terms.

## What Needs to Be Built

### 1. USDC Escrow Contract
The core smart contract deployed on Arc. It handles the full financial lifecycle of a performance contract:

**Funding**
- Accepts a USDC deposit from the merchant when they approve the agent's offer
- Locks the funds and records the contract terms (fee amount, merchant address, agent address)
- Sets contract status to Funded

**Resolution**
- Receives a resolution call from the backend/agent once the evaluation window closes
- On success: releases the escrowed USDC to the agent wallet
- On failure: refunds the escrowed USDC to the merchant wallet
- Updates contract status to Settled

**Key properties**
- Only authorized callers (the settlement resolution engine) can trigger release or refund
- Contract terms are immutable once funded — no mid-flight changes
- All state transitions are recorded on-chain for auditability

### 2. Deployment Scripts
Scripts to deploy the escrow contract to Arc or a compatible testnet:
- Deploy with configurable parameters (accepted token address, authorized settler address)
- Verify deployment and output the contract address for use by the Arc escrow adapter in the agent

### 3. Contract Interface / ABI
The compiled contract ABI and address, consumed by the Arc escrow adapter in the agent folder to:
- Call the fund function when escrow is initiated
- Call the release or refund function when outcome is resolved
- Read current escrow status
