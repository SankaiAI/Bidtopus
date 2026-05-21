"""
SIWE wallet-connect tests (issue #84).

Covers the full happy path plus every rejection branch:
- /me/wallet/nonce returns a fresh nonce
- /me/wallet with a valid SIWE message + signature: 200
- Reject when nonce is unknown
- Reject when nonce belongs to another user
- Reject when nonce already consumed
- Reject when nonce expired
- Reject when domain doesn't match config
- Reject when chain id doesn't match config
- Reject when signature doesn't recover to message.address
- Reject when body.wallet_address doesn't match message.address
- Reject when message is malformed
- Reject when the legacy (no message field) payload is sent
"""
from datetime import datetime, timedelta, timezone

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from siwe import SiweMessage, generate_nonce as siwe_generate_nonce

from db.models import WalletConnectNonce
from config import settings


SIWE_DOMAIN = "localhost:3000"
CHAIN_ID = 5042002


def _build_message(*, address: str, nonce: str, domain: str = SIWE_DOMAIN,
                   chain_id: int = CHAIN_ID,
                   issued_at: datetime | None = None) -> str:
    iat = (issued_at or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    return (
        f"{domain} wants you to sign in with your Ethereum account:\n"
        f"{address}\n"
        f"\n"
        f"Connect wallet to Bidtopus.\n"
        f"\n"
        f"URI: https://{domain}\n"
        f"Version: 1\n"
        f"Chain ID: {chain_id}\n"
        f"Nonce: {nonce}\n"
        f"Issued At: {iat}"
    )


def _sign(message: str, private_key: str) -> str:
    return Account.sign_message(encode_defunct(text=message), private_key=private_key).signature.hex()


@pytest.fixture(autouse=True)
def _siwe_config(monkeypatch):
    monkeypatch.setattr(settings, "siwe_domain", SIWE_DOMAIN)
    monkeypatch.setattr(settings, "arc_chain_id", CHAIN_ID)
    monkeypatch.setattr(settings, "siwe_nonce_ttl_seconds", 300)


@pytest.fixture
def wallet():
    acct = Account.create()
    return acct


# ── nonce minting ───────────────────────────────────────────────────────────

def test_issue_nonce_returns_fresh_string(client, db, test_user):
    res = client.post("/api/users/me/wallet/nonce")
    assert res.status_code == 200
    body = res.json()
    # SIWE spec requires >= 8 alphanumeric chars; siwe lib's generate_nonce returns ~11
    assert "nonce" in body and len(body["nonce"]) >= 8
    assert "ttl_seconds" in body
    # Persisted
    row = db.query(WalletConnectNonce).filter_by(nonce=body["nonce"]).first()
    assert row is not None
    assert row.clerk_user_id == test_user.clerk_user_id
    assert row.used_at is None


def test_issue_nonce_returns_different_value_each_call(client):
    a = client.post("/api/users/me/wallet/nonce").json()["nonce"]
    b = client.post("/api/users/me/wallet/nonce").json()["nonce"]
    assert a != b


# ── happy path ──────────────────────────────────────────────────────────────

def test_connect_wallet_happy_path(client, db, wallet, test_user):
    nonce = client.post("/api/users/me/wallet/nonce").json()["nonce"]
    msg = _build_message(address=wallet.address, nonce=nonce)
    sig = _sign(msg, wallet.key.hex())

    res = client.post(
        "/api/users/me/wallet",
        json={"wallet_address": wallet.address, "signature": sig, "message": msg},
    )
    assert res.status_code == 200, res.text
    # Wallet persisted
    db.refresh(test_user)
    assert test_user.wallet_address.lower() == wallet.address.lower()
    # Nonce consumed
    row = db.query(WalletConnectNonce).filter_by(nonce=nonce).first()
    assert row.used_at is not None


# ── rejection paths ─────────────────────────────────────────────────────────

def test_connect_rejects_unknown_nonce(client, wallet):
    # Use a SIWE-valid-format nonce so it parses cleanly, but one the server never issued
    msg = _build_message(address=wallet.address, nonce=siwe_generate_nonce())
    sig = _sign(msg, wallet.key.hex())
    res = client.post(
        "/api/users/me/wallet",
        json={"wallet_address": wallet.address, "signature": sig, "message": msg},
    )
    assert res.status_code == 400
    assert "nonce" in res.json()["detail"].lower()


def test_connect_rejects_nonce_belonging_to_other_user(client, db, other_user, wallet):
    """Insert a nonce row belonging to other_user, then try to use it as test_user.

    Done by direct DB insert because client / client_as_other share a single FastAPI
    app instance and overwrite each other's get_current_user override.
    """
    other_nonce = siwe_generate_nonce()
    db.add(WalletConnectNonce(clerk_user_id=other_user.clerk_user_id, nonce=other_nonce))
    db.commit()

    msg = _build_message(address=wallet.address, nonce=other_nonce)
    sig = _sign(msg, wallet.key.hex())
    res = client.post(
        "/api/users/me/wallet",
        json={"wallet_address": wallet.address, "signature": sig, "message": msg},
    )
    assert res.status_code == 400
    assert "nonce" in res.json()["detail"].lower()


def test_connect_rejects_consumed_nonce(client, wallet):
    nonce = client.post("/api/users/me/wallet/nonce").json()["nonce"]
    msg = _build_message(address=wallet.address, nonce=nonce)
    sig = _sign(msg, wallet.key.hex())

    first = client.post(
        "/api/users/me/wallet",
        json={"wallet_address": wallet.address, "signature": sig, "message": msg},
    )
    assert first.status_code == 200

    # Replay with the same nonce+sig+msg
    second = client.post(
        "/api/users/me/wallet",
        json={"wallet_address": wallet.address, "signature": sig, "message": msg},
    )
    assert second.status_code == 400
    assert "consumed" in second.json()["detail"].lower()


def test_connect_rejects_expired_nonce(client, db, wallet, monkeypatch):
    monkeypatch.setattr(settings, "siwe_nonce_ttl_seconds", 1)
    nonce = client.post("/api/users/me/wallet/nonce").json()["nonce"]
    # Backdate the row to push it past TTL
    row = db.query(WalletConnectNonce).filter_by(nonce=nonce).first()
    row.issued_at = datetime.now(timezone.utc) - timedelta(seconds=120)
    db.commit()

    msg = _build_message(address=wallet.address, nonce=nonce)
    sig = _sign(msg, wallet.key.hex())
    res = client.post(
        "/api/users/me/wallet",
        json={"wallet_address": wallet.address, "signature": sig, "message": msg},
    )
    assert res.status_code == 400
    assert "expired" in res.json()["detail"].lower()


def test_connect_rejects_domain_mismatch(client, wallet):
    nonce = client.post("/api/users/me/wallet/nonce").json()["nonce"]
    msg = _build_message(address=wallet.address, nonce=nonce, domain="evil.example.com")
    sig = _sign(msg, wallet.key.hex())
    res = client.post(
        "/api/users/me/wallet",
        json={"wallet_address": wallet.address, "signature": sig, "message": msg},
    )
    assert res.status_code == 400
    assert "domain" in res.json()["detail"].lower()


def test_connect_rejects_chain_id_mismatch(client, wallet):
    nonce = client.post("/api/users/me/wallet/nonce").json()["nonce"]
    msg = _build_message(address=wallet.address, nonce=nonce, chain_id=1)
    sig = _sign(msg, wallet.key.hex())
    res = client.post(
        "/api/users/me/wallet",
        json={"wallet_address": wallet.address, "signature": sig, "message": msg},
    )
    assert res.status_code == 400
    assert "chain" in res.json()["detail"].lower()


def test_connect_rejects_signature_from_wrong_key(client, wallet):
    other_key = Account.create()
    nonce = client.post("/api/users/me/wallet/nonce").json()["nonce"]
    msg = _build_message(address=wallet.address, nonce=nonce)
    bad_sig = _sign(msg, other_key.key.hex())   # signed with a different key
    res = client.post(
        "/api/users/me/wallet",
        json={"wallet_address": wallet.address, "signature": bad_sig, "message": msg},
    )
    assert res.status_code == 400
    assert "verification" in res.json()["detail"].lower()


def test_connect_rejects_body_address_mismatch(client, wallet):
    other_wallet = Account.create()
    nonce = client.post("/api/users/me/wallet/nonce").json()["nonce"]
    msg = _build_message(address=wallet.address, nonce=nonce)
    sig = _sign(msg, wallet.key.hex())
    res = client.post(
        "/api/users/me/wallet",
        json={
            "wallet_address": other_wallet.address,   # mismatch!
            "signature": sig,
            "message": msg,
        },
    )
    assert res.status_code == 400
    assert "wallet_address" in res.json()["detail"]


def test_connect_rejects_malformed_message(client, wallet):
    res = client.post(
        "/api/users/me/wallet",
        json={
            "wallet_address": wallet.address,
            "signature": "0x" + "00" * 65,
            "message": "this is not a SIWE message",
        },
    )
    assert res.status_code == 400
    assert "siwe" in res.json()["detail"].lower() or "invalid" in res.json()["detail"].lower()


def test_connect_rejects_legacy_payload_missing_message(client, wallet):
    """Old shape {wallet_address, signature} without `message` → 422 (pydantic) or 400."""
    res = client.post(
        "/api/users/me/wallet",
        json={"wallet_address": wallet.address, "signature": "0xdeadbeef"},
    )
    assert res.status_code in (400, 422)
