"""Arc Escrow Adapter — release or refund USDC on-chain via Arc.

Arc specifics:
  - Sub-second finality — no polling needed after broadcast
  - ~$0.01 fees per transaction, paid in USDC via Paymaster
  - ABI and address read from contracts/out/ (owned by contracts team)

Real implementation:
  - Read calls (getStatus): web3.py → Arc RPC URL
  - Write calls (release/refund): Circle Developer Wallets API →
    createContractExecutionTransaction using the settler wallet (AGENT_WALLET_ID)

Mock returns deterministic tx hashes for demo.
"""
from __future__ import annotations

import hashlib
import json
import time
import uuid
from pathlib import Path

import httpx

from config import settings
from exceptions import ArcError
from models.types import EscrowStatus, SettlementResult
from utils.logging import get_logger
from adapters.base import ArcEscrowAdapterBase

logger = get_logger(__name__)

# Circle W3S API endpoint for contract execution
_CIRCLE_CONTRACT_EXEC_PATH = "/developer/transactions/contractExecution"
_CIRCLE_TX_PATH = "/transactions"

# Timeout for polling Circle for transaction confirmation (Arc has sub-second finality)
_CIRCLE_POLL_TIMEOUT_SECS = 30
_CIRCLE_POLL_INTERVAL_SECS = 1


# ── Mock adapter ──────────────────────────────────────────────────────────────

def _mock_tx_hash(contract_id: str, action: str) -> str:
    raw = f"{contract_id}:{action}"
    return "0x" + hashlib.sha256(raw.encode()).hexdigest()


class MockArcEscrowAdapter(ArcEscrowAdapterBase):
    def get_status(self, contract_id: str) -> EscrowStatus:  # noqa: ARG002
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
        raise ArcError(f"ABI not found at {abi_path}. Run 'npm run compile' in contracts/.")
    with open(abi_path) as f:
        return json.load(f)


def _load_address() -> str:
    address_path = Path(settings.CONTRACTS_OUT_DIR) / "address.json"
    if not address_path.exists():
        raise ArcError(f"Address not found at {address_path}. Deploy the escrow contract first.")
    with open(address_path) as f:
        data = json.load(f)
    return data["address"]


def _fresh_ciphertext() -> str:
    """Encrypt ENTITY_SECRET with Circle's public RSA key. Must be called fresh per request."""
    import base64
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding as asym_padding

    entity_secret = bytes.fromhex(settings.ENTITY_SECRET)
    resp = httpx.get(
        f"{settings.CIRCLE_BASE_URL}/config/entity/publicKey",
        headers={"Authorization": f"Bearer {settings.CIRCLE_API_KEY}"},
        timeout=10.0,
    )
    if resp.status_code >= 400:
        raise ArcError(f"Failed to fetch Circle public key: {resp.status_code}")
    public_key = serialization.load_pem_public_key(resp.json()["data"]["publicKey"].encode())
    ciphertext = public_key.encrypt(
        entity_secret,
        asym_padding.OAEP(
            mgf=asym_padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return base64.b64encode(ciphertext).decode()


def _contract_id_to_bytes32(contract_id: str) -> str:
    """Convert a string contract ID (e.g. UUID) to a bytes32 hex string.

    Uses keccak256 of the UTF-8 string for deterministic, collision-resistant mapping.
    The agent, backend, and contract all derive this the same way.
    """
    try:
        from web3 import Web3
        return "0x" + Web3.keccak(text=contract_id).hex()
    except ImportError as e:
        raise ArcError("web3 package required. pip install web3") from e


class RealArcEscrowAdapter(ArcEscrowAdapterBase):
    """Production adapter.

    Read calls (getStatus) go via web3.py → Arc RPC.
    Write calls (release/refund) go via Circle Developer Wallets API using
    the agent's Circle Wallet as the settler — no raw private key in env.
    """

    def __init__(self) -> None:
        if not settings.ARC_RPC_URL:
            raise ArcError("ARC_RPC_URL is required when ARC_MOCK=False")
        if not settings.CIRCLE_API_KEY:
            raise ArcError("CIRCLE_API_KEY is required when ARC_MOCK=False")
        if not settings.AGENT_WALLET_ID:
            raise ArcError("AGENT_WALLET_ID (settler Circle wallet) required when ARC_MOCK=False")
        if not settings.ENTITY_SECRET:
            raise ArcError("ENTITY_SECRET is required when ARC_MOCK=False")

        try:
            from web3 import Web3
            self._w3 = Web3(Web3.HTTPProvider(settings.ARC_RPC_URL))
        except ImportError as e:
            raise ArcError("web3 package required. pip install web3") from e

        self._abi = _load_abi()
        self._address = _load_address()
        self._contract = self._w3.eth.contract(
            address=self._w3.to_checksum_address(self._address),
            abi=self._abi,
        )
        self._circle = httpx.Client(
            base_url=settings.CIRCLE_BASE_URL,
            headers={
                "Authorization": f"Bearer {settings.CIRCLE_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=60.0,
        )

    def get_status(self, contract_id: str) -> EscrowStatus:
        bytes32_id = _contract_id_to_bytes32(contract_id)
        # getStatus returns uint8 (0=Unfunded, 1=Funded, 2=Released, 3=Refunded)
        status_int = self._contract.functions.getStatus(bytes32_id).call()
        _status_map = {0: "unfunded", 1: "funded", 2: "released", 3: "refunded"}

        amount_usdc = 0.0
        if status_int != 0:
            _, _, raw_amount, _ = self._contract.functions.getEscrow(bytes32_id).call()
            amount_usdc = raw_amount / 1_000_000  # USDC has 6 decimals

        return EscrowStatus(
            status=_status_map.get(status_int, "unfunded"),
            amount_usdc=amount_usdc,
            contract_address=self._address,
        )

    def release(self, contract_id: str, amount_usdc: float) -> SettlementResult:
        # Pre-flight: verify on-chain status before touching Circle API.
        # Catches DB/chain drift and prevents a confusing Circle error if already settled.
        current = self.get_status(contract_id)
        if current.status != "funded":
            raise ArcError(
                f"Cannot release: escrow {contract_id} is '{current.status}', expected 'funded'"
            )

        bytes32_id = _contract_id_to_bytes32(contract_id)
        logger.info("arc_escrow_release", contract_id=contract_id, contract_address=self._address)

        tx_hash, _ = self._execute_contract(
            abi_function_signature="release(bytes32)",
            abi_parameters=[bytes32_id],
            action="release",
            contract_id=contract_id,
            expected_post_status="released",
        )

        agent_address = self._get_agent_wallet_address()
        return SettlementResult(
            action="release",
            tx_hash=tx_hash,
            amount_usdc=current.amount_usdc or amount_usdc,
            recipient_address=agent_address,
        )

    def refund(self, contract_id: str, amount_usdc: float) -> SettlementResult:
        # Pre-flight: verify on-chain status before touching Circle API.
        current = self.get_status(contract_id)
        if current.status != "funded":
            raise ArcError(
                f"Cannot refund: escrow {contract_id} is '{current.status}', expected 'funded'"
            )

        bytes32_id = _contract_id_to_bytes32(contract_id)
        logger.info("arc_escrow_refund", contract_id=contract_id, contract_address=self._address)

        tx_hash, _ = self._execute_contract(
            abi_function_signature="refund(bytes32)",
            abi_parameters=[bytes32_id],
            action="refund",
            contract_id=contract_id,
            expected_post_status="refunded",
        )

        return SettlementResult(
            action="refund",
            tx_hash=tx_hash,
            amount_usdc=current.amount_usdc or amount_usdc,
            recipient_address="on-chain-merchant",
        )

    def _execute_contract(
        self,
        abi_function_signature: str,
        abi_parameters: list,
        action: str,
        contract_id: str,
        expected_post_status: str,
    ) -> tuple[str, str]:
        """Submit a contract execution via Circle Wallets API and wait for confirmation.

        Returns (tx_hash, state).
        Arc has sub-second finality, so polling converges quickly.
        Falls back to on-chain status check on Circle poll timeout so we never
        falsely fail when the tx actually landed.
        """
        idempotency_key = str(uuid.uuid4())
        resp = self._circle.post(
            _CIRCLE_CONTRACT_EXEC_PATH,
            json={
                "idempotencyKey": idempotency_key,
                "walletId": settings.AGENT_WALLET_ID,
                "contractAddress": self._address,
                "abiFunctionSignature": abi_function_signature,
                "abiParameters": abi_parameters,
                "entitySecretCiphertext": _fresh_ciphertext(),
                # Arc SCA wallets require feeLevel at the top level (not nested in fee.config)
                "feeLevel": settings.ARC_FEE_LEVEL,
            },
        )
        if resp.status_code >= 400:
            raise ArcError(
                f"Circle contract execution failed ({resp.status_code}): {resp.text[:300]}"
            )

        transaction_id = resp.json()["data"]["id"]
        logger.info("arc_circle_tx_initiated", action=action, transaction_id=transaction_id)

        tx_hash = self._wait_for_confirmation(
            transaction_id, action, contract_id, expected_post_status
        )
        return tx_hash, "confirmed"

    def _wait_for_confirmation(
        self,
        transaction_id: str,
        action: str,
        contract_id: str,
        expected_post_status: str,
    ) -> str:
        """Poll Circle until confirmed. On timeout, falls back to on-chain status check.

        Arc has sub-second finality, so Circle confirmation usually arrives in 1-2 polls.
        The on-chain fallback handles the rare case where Circle's API is slow but the
        transaction actually landed — prevents falsely raising ArcError after a real settlement.
        """
        deadline = time.time() + _CIRCLE_POLL_TIMEOUT_SECS
        while time.time() < deadline:
            resp = self._circle.get(f"{_CIRCLE_TX_PATH}/{transaction_id}")
            if resp.status_code >= 400:
                raise ArcError(
                    f"Circle transaction poll failed ({resp.status_code}): {resp.text[:300]}"
                )

            tx_data = resp.json()["data"]["transaction"]
            state = tx_data.get("state", "")

            if state == "CONFIRMED":
                tx_hash = tx_data.get("txHash", "")
                logger.info(
                    "arc_circle_tx_confirmed",
                    action=action,
                    transaction_id=transaction_id,
                    tx_hash=tx_hash,
                )
                return tx_hash

            if state in ("FAILED", "DENIED", "CANCELLED"):
                raise ArcError(
                    f"Circle transaction {transaction_id} ended in state '{state}' "
                    f"for action={action}. Full response: {resp.text[:500]}"
                )

            time.sleep(_CIRCLE_POLL_INTERVAL_SECS)

        # Circle timed out — check on-chain directly before giving up.
        # The tx may have confirmed on Arc while Circle's API was slow.
        logger.warning(
            "arc_circle_poll_timeout_fallback",
            action=action,
            transaction_id=transaction_id,
            contract_id=contract_id,
        )
        on_chain = self.get_status(contract_id)
        if on_chain.status == expected_post_status:
            # Transaction landed on-chain; Circle just hasn't caught up yet.
            logger.info(
                "arc_circle_fallback_confirmed_on_chain",
                action=action,
                contract_id=contract_id,
                status=on_chain.status,
            )
            # Return Circle transaction ID as a stand-in hash — real tx hash
            # is in the on-chain event log, but we don't have it here.
            return f"circle-tx:{transaction_id}"

        raise ArcError(
            f"Circle transaction {transaction_id} did not confirm within "
            f"{_CIRCLE_POLL_TIMEOUT_SECS}s and on-chain status is '{on_chain.status}' "
            f"(expected '{expected_post_status}') for action={action}"
        )

    def _get_agent_wallet_address(self) -> str:
        """Fetch the agent wallet's on-chain address from Circle."""
        resp = self._circle.get(f"/wallets/{settings.AGENT_WALLET_ID}")
        if resp.status_code >= 400:
            return settings.AGENT_WALLET_ID  # fallback to wallet ID if fetch fails
        return resp.json()["data"]["wallet"]["address"]


# ── Factory ───────────────────────────────────────────────────────────────────

ArcEscrowAdapter = ArcEscrowAdapterBase


def get_arc_escrow_adapter() -> ArcEscrowAdapterBase:
    if settings.ARC_MOCK:
        return MockArcEscrowAdapter()
    return RealArcEscrowAdapter()
