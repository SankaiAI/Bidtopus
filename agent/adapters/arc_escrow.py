"""Arc Escrow Adapter — release or refund USDC on-chain via Arc.

Arc specifics:
  - Sub-second finality — no polling needed after broadcast
  - ~$0.01 fees per transaction, paid in USDC via Paymaster
  - ABI and address read from contracts/out/ (owned by contracts team)

Real implementation requires:
  - ESCROW_CONTRACT_ADDRESS in env
  - ARC_RPC_URL in env
  - Circle Wallets for signing (settler wallet ID, not raw private key)

Mock returns deterministic tx hashes for demo.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from config import settings
from exceptions import ArcError
from models.types import EscrowStatus, SettlementResult
from utils.logging import get_logger
from adapters.base import ArcEscrowAdapterBase

logger = get_logger(__name__)


# ── Mock adapter ──────────────────────────────────────────────────────────────

def _mock_tx_hash(contract_id: str, action: str) -> str:
    raw = f"{contract_id}:{action}"
    return "0x" + hashlib.sha256(raw.encode()).hexdigest()


class MockArcEscrowAdapter(ArcEscrowAdapterBase):
    def get_status(self, contract_id: str) -> EscrowStatus:
        return EscrowStatus(
            status="funded",
            amount_usdc=100.0,
            contract_address=settings.ESCROW_CONTRACT_ADDRESS or "0xMOCK",
        )

    def release(self, contract_id: str, amount_usdc: float) -> SettlementResult:
        tx_hash = _mock_tx_hash(contract_id, "release")
        logger.info("mock_escrow_release", contract_id=contract_id, tx_hash=tx_hash)
        return SettlementResult(
            action="release",
            tx_hash=tx_hash,
            amount_usdc=amount_usdc,
            recipient_address=settings.AGENT_WALLET_ID or "0xAGENT",
        )

    def refund(self, contract_id: str, amount_usdc: float) -> SettlementResult:
        tx_hash = _mock_tx_hash(contract_id, "refund")
        logger.info("mock_escrow_refund", contract_id=contract_id, tx_hash=tx_hash)
        return SettlementResult(
            action="refund",
            tx_hash=tx_hash,
            amount_usdc=amount_usdc,
            recipient_address="0xMERCHANT",
        )


# ── Real adapter ──────────────────────────────────────────────────────────────

def _load_abi() -> list:
    abi_path = Path(settings.CONTRACTS_OUT_DIR) / "abi.json"
    if not abi_path.exists():
        raise ArcError(f"ABI not found at {abi_path}. Run 'forge build' in contracts/.")
    with open(abi_path) as f:
        return json.load(f)


def _load_address() -> str:
    address_path = Path(settings.CONTRACTS_OUT_DIR) / "address.json"
    if not address_path.exists():
        raise ArcError(f"Address not found at {address_path}. Deploy the escrow contract first.")
    with open(address_path) as f:
        data = json.load(f)
    return data["address"]


class RealArcEscrowAdapter(ArcEscrowAdapterBase):
    """Production adapter using web3.py + Circle Wallets for signing.

    Signing is delegated to Circle Wallets — raw private key never touches the codebase.
    """

    def __init__(self) -> None:
        try:
            from web3 import Web3
            self._w3 = Web3(Web3.HTTPProvider(settings.ARC_RPC_URL))
            self._abi = _load_abi()
            self._address = _load_address()
            self._contract = self._w3.eth.contract(
                address=self._w3.to_checksum_address(self._address),
                abi=self._abi,
            )
        except ImportError as e:
            raise ArcError("web3 package required for real Arc adapter. pip install web3") from e

    def get_status(self, contract_id: str) -> EscrowStatus:
        raise NotImplementedError("Wire Arc escrow contract read when deployed")

    def release(self, contract_id: str, amount_usdc: float) -> SettlementResult:
        raise NotImplementedError("Wire Arc release() when contract is deployed")

    def refund(self, contract_id: str, amount_usdc: float) -> SettlementResult:
        raise NotImplementedError("Wire Arc refund() when contract is deployed")


# ── Factory ───────────────────────────────────────────────────────────────────

ArcEscrowAdapter = ArcEscrowAdapterBase


def get_arc_escrow_adapter() -> ArcEscrowAdapterBase:
    if settings.ARC_MOCK:
        return MockArcEscrowAdapter()
    return RealArcEscrowAdapter()
