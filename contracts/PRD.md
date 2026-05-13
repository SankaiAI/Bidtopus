# OutcomeX — Contracts Sub-PRD
**Version 1.1 | Hackathon MVP**

---

## 1. Purpose

The contracts folder contains the on-chain smart contract that makes OutcomeX trustless. Without it, the merchant and agent would have to trust each other — the merchant that the agent will refund if it fails, the agent that the merchant will pay if it succeeds. The escrow contract removes that trust requirement entirely: funds are locked on-chain, and the settlement rules are immutable and publicly verifiable.

This is what turns OutcomeX from a software product into a true economic protocol.

---

## 2. What Arc Actually Is

Arc is **Circle's purpose-built L1 blockchain** — not a generic EVM testnet. It is designed specifically for stablecoin-native applications and autonomous agents.

Key properties that directly benefit OutcomeX:
- **Sub-second deterministic finality** — escrow funding and settlement confirm instantly
- **~$0.01 transaction fees paid in USDC** — not volatile gas tokens; fees are predictable and denominated in the same asset as the escrow
- **Paymaster support** — transaction fees can be sponsored in USDC so merchants never need to hold a native gas token

Arc is the hackathon's required settlement layer. The judges expect to see real on-chain transactions on Arc, not a generic EVM chain.

---

## 3. Developer Setup — ARC CLI

The hackathon host provides a dedicated CLI that must be used for Arc development:

```bash
uv tool install git+https://github.com/the-canteen-dev/ARC-cli
```

This CLI includes:
- RPC access to the Canteen-hosted Arc testnet
- Arc repos and documentation pre-bundled as agent context
- Everything needed to deploy and interact with contracts on Arc without setting up your own node

Reference docs:
- Arc developer docs: https://docs.arc.network
- Canteen Arc node docs: https://arc-node.thecanteenapp.com/

---

## 4. Reference Implementation

The hackathon host provides an Arc escrow reference implementation:
**Arc escrow — AI-powered work validation and USDC settlement**

This is available in the Arc sample apps index and is directly relevant to OutcomeX. Start by reviewing and forking this reference implementation rather than building from scratch. It covers the core escrow pattern (lock → validate → release/refund) that OutcomeX needs.

---

## 5. The Role of USDC and Arc

| Component | Role in OutcomeX |
|---|---|
| USDC | The escrowed success fee and settlement asset |
| Arc | Circle's purpose-built L1 — the settlement environment for conditional payout or refund |
| Smart contract | Stores contract terms, escrow status, and executes settlement action |
| Paymaster | Sponsors transaction fees in USDC so merchants don't need a gas token |
| Transaction record | Transparent, on-chain proof of agent compensation or merchant refund |

Arc is not cosmetic. It is what makes the settlement auditable and trustless. Every fund movement must have an on-chain transaction hash.

---

## 6. What to Build

### 6.1 USDC Escrow Smart Contract

The core contract deployed on Arc. It governs the full financial lifecycle of a performance contract.

#### Roles
| Role | Address type | Responsibility |
|---|---|---|
| Merchant | Wallet (Circle Wallets or external) | Deposits USDC; receives refund on failure |
| Agent | Wallet (Circle Wallets, autonomous key management) | Receives USDC on success |
| Settler | Authorized backend/agent address | The only address that can call release or refund |

#### Contract State
```
Unfunded → Funded → Released (success) | Refunded (failure)
```

#### Key functions

**`fund(amount, merchantAddress, agentAddress)`**
- Called when the merchant approves the agent's offer and the backend initiates escrow
- Transfers USDC from the merchant's wallet to the contract
- Records: merchant address, agent address, agreed amount, block timestamp
- Sets status → Funded
- Emits: `Funded(contractId, merchant, agent, amount, timestamp)`

**`release()`**
- Called only by the authorized settler address
- Transfers escrowed USDC to the agent wallet
- Sets status → Released
- Emits: `Released(contractId, agent, amount, timestamp)`

**`refund()`**
- Called only by the authorized settler address
- Transfers escrowed USDC back to the merchant wallet
- Sets status → Refunded
- Emits: `Refunded(contractId, merchant, amount, timestamp)`

**`getStatus()`**
- Returns current escrow status: Unfunded / Funded / Released / Refunded
- Read-only; callable by anyone

#### Security properties
- Only the designated settler address can call `release()` or `refund()` — not the merchant, not the agent
- Contract terms (merchant address, agent address, amount) are immutable once funded — no mid-flight changes
- Double-settlement is prevented: once Released or Refunded, neither function can be called again
- USDC token address is set at deployment and cannot be changed

---

### 6.2 Paymaster Integration

Integrate Arc's Paymaster so that transaction fees are paid in USDC rather than a native gas token. This means:
- Merchants only ever need USDC — no need to acquire a separate gas token
- The agent's settlement calls (release/refund) are also fee-sponsored in USDC
- The user experience is entirely USDC-denominated

This is a judging criterion (Circle tool usage, 20%) and a real UX improvement.

---

### 6.3 Deployment Scripts

Scripts to deploy the escrow contract to the Arc testnet using the ARC CLI.

**Must support:**
- Configurable parameters at deploy time:
  - USDC token contract address on Arc testnet
  - Authorized settler address (the backend/agent resolution engine's wallet)
- Output after deploy:
  - Deployed contract address
  - Transaction hash of deployment
  - Network name and block number

The deployed contract address and ABI must be written to a shared output file that the `agent/` folder's Arc escrow adapter imports.

---

### 6.4 Contract ABI and Address Export

After deployment, export:
- `abi.json` — the full contract ABI
- `address.json` — the deployed address per network (Arc testnet primary; Arc mainnet if available)

These files are the interface contract between `contracts/` and `agent/`. The Arc escrow adapter in `agent/` reads these files to make on-chain calls.

---

## 7. Demo Scenario — What the Contract Must Prove

For the hackathon demo, the contract must produce verifiable on-chain evidence for this scenario:

| Event | On-chain action |
|---|---|
| Merchant funds escrow | `fund()` called; 100 USDC locked; tx hash logged |
| Agent succeeds (ROAS 2.25 >= 2.0) | `release()` called by settler; 100 USDC sent to agent wallet |
| On-chain status | `getStatus()` returns Released |

Both the funding tx hash and the settlement tx hash are shown on the frontend Resolution screen. These are the proof that the economic loop is complete and trustless, and they are what the judges will inspect.

---

## 8. Judging Context

This folder directly influences two judging categories:
- **Circle tool usage (20%)** — the contract must use Arc, USDC, and Paymaster correctly and demonstrably
- **Agentic Sophistication (30%)** — the on-chain settlement is what proves the agent is economically autonomous, not just text-generating

The judges will look for real transactions on Arc testnet with real tx hashes. A simulated or mocked escrow will not score here.

---

## 9. Safety & Trust Rules

- The settler address must be a controlled wallet (backend/agent key), not a public address.
- The contract must reject any call to `release()` or `refund()` from non-settler addresses.
- The contract must reject a second `release()` or `refund()` if already settled.
- The USDC token address is hardcoded at deployment — no dynamic token switching.
- Contract source code should be verifiable on the Arc block explorer for the demo.

---

## 9a. Security Rules (Smart Contract)

### Reentrancy Prevention — Check-Effects-Interactions Pattern

State must be updated **before** any external token transfer. This is the single most important smart contract security rule.

```solidity
// WRONG — state updated after transfer (reentrancy window open)
function release() external onlySetter {
    require(status == Status.Funded, "Not funded");
    usdc.transfer(agent, amount);   // external call — attacker re-enters here
    status = Status.Released;       // too late, state not yet updated
}

// CORRECT — state updated before transfer
function release() external onlySetter {
    require(status == Status.Funded, "Not funded");
    status = Status.Released;            // close the reentrancy window first
    emit Released(contractId, agent, amount, block.timestamp);
    usdc.safeTransfer(agent, amount);    // then transfer using OpenZeppelin SafeERC20
}
```

Apply this pattern to both `release()` and `refund()`.

### Settler Private Key is the Master Key to All Escrows

If `SETTLER_PRIVATE_KEY` leaks, an attacker calls `release()` on every funded escrow and drains all USDC to the agent wallet. This is catastrophic and irreversible.

- Use **Circle Wallets** (HSM-backed) for the settler — never a raw private key in an env var
- The settler wallet should hold zero balance of its own — it only signs transactions, the Paymaster covers fees
- Add an explicit `require(amount > 0)` guard in `fund()` so zero-value escrows cannot be created

### Verify USDC Token Address Before Deployment

The USDC token address is hardcoded at deploy time and cannot be changed. Deploying with the wrong address means all escrowed "USDC" goes to a black hole contract.

Before deploying: verify the address against Circle's official Arc testnet USDC documentation. Log it explicitly in the deploy script output:

```javascript
console.log("Deploying with USDC address:", USDC_TOKEN_ADDRESS);
console.log("Settler address:", SETTLER_ADDRESS);
// Require manual confirmation before proceeding
```

### Double-Settlement Prevention

The `onlySetter` modifier prevents unauthorized callers. The status check prevents double-settlement. Both must be present:

```solidity
modifier onlySetter() {
    require(msg.sender == settler, "Not authorized settler");
    _;
}

function release() external onlySetter {
    require(status == Status.Funded, "Already settled or not funded");
    // ... check-effects-interactions pattern above
}
```

### Emit Events for Every State Change

On-chain proof is a judging criterion. All three settlement functions must emit events with full context. Verify events appear in the Arc block explorer before the demo.

```solidity
event Funded(bytes32 indexed contractId, address merchant, address agent, uint256 amount, uint256 timestamp);
event Released(bytes32 indexed contractId, address agent, uint256 amount, uint256 timestamp);
event Refunded(bytes32 indexed contractId, address merchant, uint256 amount, uint256 timestamp);
```

---

## 10. MVP Acceptance Criteria (Contracts)

- [ ] ARC CLI is installed and connected to the Canteen-hosted Arc testnet.
- [ ] Escrow contract deploys successfully to Arc testnet.
- [ ] `fund()` correctly locks USDC and emits a Funded event with a real Arc tx hash.
- [ ] `release()` correctly transfers USDC to the agent wallet and emits a Released event.
- [ ] `refund()` correctly returns USDC to the merchant wallet and emits a Refunded event.
- [ ] Only the authorized settler address can call `release()` or `refund()`.
- [ ] Double-settlement is prevented.
- [ ] Paymaster is wired so fees are paid in USDC, not a native gas token.
- [ ] ABI and contract address are exported for use by the `agent/` escrow adapter.
- [ ] The demo shows real Arc tx hashes for both the funding and the settlement events.

---

## 11. Non-Goals for MVP

- Multi-token support (only USDC)
- CCTP cross-chain settlement (single-chain Arc for MVP)
- Upgradeability or proxy patterns
- Complex multi-sig authorization
- Full KYC or compliance flow
- On-chain storage of full contract terms (only addresses and amount need to be on-chain; full terms live in the backend DB)

---

## 12. Stretch Goals (Contracts)

| Goal | What to build |
|---|---|
| USYC idle yield | Park escrowed USDC in USYC while the contract is Active; convert back at resolution |
| CPA + ROAS dual target on-chain | Store both metrics in the contract; settler must pass both before release |
| Multi-agent escrow | Contract supports multiple agent bids; merchant selects one to fund |
| On-chain contract terms hash | Store a hash of the full contract terms as a tamper-evident audit anchor |
| CCTP cross-chain | Accept USDC from other chains via CCTP and settle on Arc |

---

## 13. Dependencies

| Needs from | What |
|---|---|
| `agent/` | The settler wallet address (to authorize at deploy time); calls release/refund via Arc escrow adapter |
| `backend/` | Calls fund-escrow endpoint which initiates the on-chain fund() call |
| `frontend/` | Displays tx hashes from fund() and release()/refund() on the escrow and resolution screens |
| ARC CLI | Required for deployment and testnet access |
