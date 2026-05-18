"""One-time script to create the Circle entity secret and agent settler wallet."""
import base64
import json
import os
import secrets
import uuid

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

CIRCLE_API_KEY = os.environ["CIRCLE_API_KEY"]
BASE_URL = "https://api.circle.com/v1/w3s"

headers = {
    "Authorization": f"Bearer {CIRCLE_API_KEY}",
    "Content-Type": "application/json",
}

# ── Step 1: Generate entity secret (32 random bytes) ──────────────────────────
entity_secret_hex = secrets.token_hex(32)
entity_secret_bytes = bytes.fromhex(entity_secret_hex)
print(f"\nENTITY_SECRET (save this securely — never share it):\n  {entity_secret_hex}\n")

# ── Step 2: Get Circle's RSA public key ───────────────────────────────────────
resp = httpx.get(f"{BASE_URL}/config/entity/publicKey", headers=headers)
resp.raise_for_status()
public_key_pem = resp.json()["data"]["publicKey"]

public_key = serialization.load_pem_public_key(public_key_pem.encode())
ciphertext = public_key.encrypt(
    entity_secret_bytes,
    padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        algorithm=hashes.SHA256(),
        label=None,
    ),
)
entity_secret_ciphertext = base64.b64encode(ciphertext).decode()

# ── Step 3: Register entity secret with Circle ────────────────────────────────
resp = httpx.post(
    f"{BASE_URL}/config/entity/securityConfig",
    headers=headers,
    json={"entitySecretCiphertext": entity_secret_ciphertext},
)
if resp.status_code not in (200, 201):
    # 409 = already registered — that's fine
    if resp.status_code != 409:
        print(f"Warning registering entity secret: {resp.status_code} {resp.text}")

# ── Step 4: Create wallet set ─────────────────────────────────────────────────
resp = httpx.post(
    f"{BASE_URL}/developer/walletSets",
    headers=headers,
    json={
        "idempotencyKey": str(uuid.uuid4()),
        "name": "OutcomeX Agent",
        "entitySecretCiphertext": entity_secret_ciphertext,
    },
)
resp.raise_for_status()
wallet_set_id = resp.json()["data"]["walletSet"]["id"]

# ── Step 5: Create settler wallet on Arc testnet ──────────────────────────────
resp = httpx.post(
    f"{BASE_URL}/developer/wallets",
    headers=headers,
    json={
        "idempotencyKey": str(uuid.uuid4()),
        "walletSetId": wallet_set_id,
        "blockchains": ["ARC-TESTNET"],
        "count": 1,
        "accountType": "SCA",
        "entitySecretCiphertext": entity_secret_ciphertext,
    },
)
resp.raise_for_status()
wallet = resp.json()["data"]["wallets"][0]

print("── Paste these into your .env files ─────────────────────────────────────")
print(f"CIRCLE_WALLET_SET_ID={wallet_set_id}")
print(f"AGENT_WALLET_ID={wallet['id']}")
print(f"SETTLER_ADDRESS={wallet['address']}")
print()
print("── Also add to agent/.env ───────────────────────────────────────────────")
print(f"ENTITY_SECRET={entity_secret_hex}")
