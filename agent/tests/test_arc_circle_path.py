"""Option 1 Arc settlement path test.

Verifies the Circle → Arc execution path WITHOUT a funded escrow.
Calls release(bytes32) on an unfunded contractId.

Expected outcome:
  - Circle API accepts the request and returns a transaction_id  ✓
  - Arc receives the transaction and reverts (no funded escrow)  ✓
  - Circle reports state FAILED                                  ✓

Any result other than a network error proves the full wiring:
  Circle auth ✓ · Circle can reach Arc ✓ · Arc processes the call ✓

Run from agent/ directory:
    .venv/Scripts/python -m pytest tests/test_arc_circle_path.py -s -v
"""
import sys
import os
import uuid

import pytest

# Ensure agent root is on the path when run standalone
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from config import settings


def _skip_if_not_configured():
    missing = []
    if not settings.CIRCLE_API_KEY:
        missing.append("CIRCLE_API_KEY")
    if not settings.AGENT_WALLET_ID:
        missing.append("AGENT_WALLET_ID")
    if not settings.ENTITY_SECRET:
        missing.append("ENTITY_SECRET")
    if not settings.ESCROW_CONTRACT_ADDRESS:
        missing.append("ESCROW_CONTRACT_ADDRESS")
    if not settings.ARC_RPC_URL:
        missing.append("ARC_RPC_URL")
    if missing:
        pytest.skip(f"Missing env vars: {', '.join(missing)}")


def test_arc_rpc_reachable():
    """Arc RPC responds and returns the expected chain ID (5042002)."""
    _skip_if_not_configured()
    import httpx

    resp = httpx.post(
        settings.ARC_RPC_URL,
        json={"jsonrpc": "2.0", "method": "eth_chainId", "params": [], "id": 1},
        timeout=10.0,
    )
    assert resp.status_code == 200
    chain_id = int(resp.json()["result"], 16)
    assert chain_id == 5042002, f"Unexpected chain ID: {chain_id}"
    print(f"\n  Arc RPC OK — chainId={chain_id}")


def test_escrow_contract_deployed():
    """PerformanceEscrow contract has bytecode at the configured address."""
    _skip_if_not_configured()
    import httpx

    resp = httpx.post(
        settings.ARC_RPC_URL,
        json={
            "jsonrpc": "2.0",
            "method": "eth_getCode",
            "params": [settings.ESCROW_CONTRACT_ADDRESS, "latest"],
            "id": 2,
        },
        timeout=10.0,
    )
    code = resp.json()["result"]
    assert code and code != "0x", "No contract bytecode at ESCROW_CONTRACT_ADDRESS"
    print(f"\n  Contract bytecode present: {len(code) // 2} bytes")


def test_circle_arc_release_unfunded():
    """Core path test: Circle accepts release(bytes32), Arc reverts (unfunded), Circle reports FAILED.

    A FAILED result is the *correct* outcome here — it proves:
      · Circle API accepted and authenticated the request
      · Circle signed and broadcast the transaction to Arc
      · Arc received and executed the call (reverting because no funded escrow)

    An exception or non-200 from Circle would indicate an auth/config problem.
    """
    _skip_if_not_configured()

    if settings.ARC_MOCK:
        pytest.skip("ARC_MOCK=True — set ARC_MOCK=False to run this test")

    from adapters.arc_escrow import RealArcEscrowAdapter

    adapter = RealArcEscrowAdapter()
    fake_contract_id = str(uuid.uuid4())
    print(f"\n  Test contract_id: {fake_contract_id}")

    from eth_hash.auto import keccak
    bytes32_id = "0x" + keccak(fake_contract_id.encode()).hex()
    print(f"  bytes32 contractId: {bytes32_id}")

    # Call _execute_contract() directly, bypassing the pre-flight get_status check.
    # The call will reach Arc, which will revert — so FAILED is the expected Circle state.
    try:
        tx_hash, state = adapter._execute_contract(
            abi_function_signature="release(bytes32)",
            abi_parameters=[bytes32_id],
            action="release",
            contract_id=fake_contract_id,
            expected_post_status="released",
        )
        # If we somehow get here (shouldn't with an unfunded escrow), log it
        print(f"  Unexpected success: tx_hash={tx_hash} state={state}")
        pytest.fail("Expected Arc to revert for an unfunded escrow")

    except Exception as exc:
        msg = str(exc)
        print(f"  Exception: {msg}")

        # A FAILED/DENIED state from Circle means the tx reached Arc — wiring confirmed
        if any(word in msg for word in ("FAILED", "DENIED", "reverted", "revert")):
            print("  PASS — Circle submitted to Arc; Arc reverted as expected")
            return

        # Any other exception is a config/auth/network issue
        pytest.fail(f"Unexpected error (not an Arc revert): {msg}")
