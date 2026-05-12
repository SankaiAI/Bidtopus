# OutcomeX — Backend

## Purpose
The backend is the API and data layer. It receives requests from the frontend, persists all contract state to the database, and routes work to the agent. It is intentionally thin — business logic lives in the agent, not here.

## What Needs to Be Built

### 1. API Layer
A set of REST endpoints that expose the full contract lifecycle to the frontend. Based on the product flow, the endpoints cover:
- Creating a new performance contract
- Triggering underwriting
- Returning the agent's accept/counter/reject offer
- Accepting the final offer
- Funding the escrow
- Generating the strategy plan
- Approving execution
- Executing ad actions
- Fetching live performance snapshots
- Resolving the outcome and triggering settlement

### 2. Database Models & Persistence
Stores all state required to run and audit a contract lifecycle:
- Users (merchant identity, wallet address)
- Performance contracts (target metric, threshold, spend floor, time window, fee, status)
- Underwriting results (probability, risk level, recommendation)
- Agent offers (offer type, message, revised terms if counteroffered)
- Escrow records (on-chain contract reference, transaction hash, amount, status)
- Strategy plans (summary, planned actions, approval status)
- Performance snapshots (timestamped spend, revenue, ROAS, success probability)
- Resolution records (final metrics, outcome, settlement transaction hash)

### 3. Authentication & Session Handling
Identifies which merchant is acting at each step. For the MVP this can be wallet-based or a simple session — enough to associate contracts with a user and protect execution endpoints.

### 4. Audit Trail
Every significant state transition (contract created, offer accepted, escrow funded, execution approved, outcome resolved) must be logged with a timestamp so the full lifecycle is reconstructable after the fact.
