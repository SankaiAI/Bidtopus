"""
Meta Ads account endpoints + multi-account scoping (issue #76).

Covers:
- List/create/delete on /api/users/me/meta-accounts
- Cross-merchant ownership denial
- ?meta_ads_account_id= filter on GET /api/contracts
- ContractResponse.meta_ads_account_id is populated
"""
from db.models import MetaAdsAccount


def _make_account(db, merchant_id, external_id="act_1234567", name=None):
    acc = MetaAdsAccount(
        merchant_id=merchant_id,
        meta_ads_account_id=external_id,
        name=name or f"Test — {external_id}",
    )
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc


# ── /api/users/me/meta-accounts ──────────────────────────────────────────────

def test_list_meta_accounts_empty(client):
    res = client.get("/api/users/me/meta-accounts")
    assert res.status_code == 200
    assert res.json() == []


def test_list_meta_accounts_returns_only_mine(client, db, test_user, other_user):
    mine = _make_account(db, test_user.id, "act_1111")
    _make_account(db, other_user.id, "act_2222")
    res = client.get("/api/users/me/meta-accounts")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["id"] == mine.id
    assert body[0]["meta_ads_account_id"] == "act_1111"


def test_create_meta_account(client):
    res = client.post(
        "/api/users/me/meta-accounts",
        json={"meta_ads_account_id": "act_9999", "name": "Demo"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["meta_ads_account_id"] == "act_9999"
    assert body["name"] == "Demo"


def test_create_meta_account_is_idempotent(client, db, test_user):
    existing = _make_account(db, test_user.id, "act_dup")
    res = client.post(
        "/api/users/me/meta-accounts",
        json={"meta_ads_account_id": "act_dup", "name": "ignored"},
    )
    assert res.status_code == 201
    assert res.json()["id"] == existing.id


def test_delete_meta_account(client, db, test_user):
    acc = _make_account(db, test_user.id, "act_to_delete")
    acc_id = acc.id   # capture before the API call expires the ORM instance
    res = client.delete(f"/api/users/me/meta-accounts/{acc_id}")
    assert res.status_code == 204
    assert db.query(MetaAdsAccount).filter_by(id=acc_id).first() is None


def test_delete_meta_account_cross_merchant_forbidden(client, db, other_user):
    acc = _make_account(db, other_user.id, "act_other")
    res = client.delete(f"/api/users/me/meta-accounts/{acc.id}")
    assert res.status_code == 403


def test_delete_meta_account_missing_is_idempotent(client):
    res = client.delete("/api/users/me/meta-accounts/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 204


# ── ?meta_ads_account_id= filter on /api/contracts ──────────────────────────

def test_list_contracts_filtered_by_account(client, db, test_user, contract_in_state):
    acc_a = _make_account(db, test_user.id, "act_aaa")
    acc_b = _make_account(db, test_user.id, "act_bbb")
    c1 = contract_in_state("Created", meta_ads_account_id=acc_a.id)
    c2 = contract_in_state("Created", meta_ads_account_id=acc_a.id)
    c3 = contract_in_state("Created", meta_ads_account_id=acc_b.id)

    res = client.get(f"/api/contracts?meta_ads_account_id={acc_a.id}")
    assert res.status_code == 200
    returned = {c["id"] for c in res.json()}
    assert returned == {c1.id, c2.id}
    assert c3.id not in returned


def test_list_contracts_filter_cross_merchant_forbidden(client, db, other_user):
    other_acc = _make_account(db, other_user.id, "act_xxx")
    res = client.get(f"/api/contracts?meta_ads_account_id={other_acc.id}")
    assert res.status_code == 403


def test_list_contracts_filter_bad_account_id_forbidden(client):
    """Non-existent account id is treated the same as cross-merchant — 403, not 404."""
    res = client.get("/api/contracts?meta_ads_account_id=00000000-0000-0000-0000-000000000000")
    assert res.status_code == 403


# ── ContractResponse.meta_ads_account_id is populated ───────────────────────

def test_contract_response_includes_meta_account_id(client, db, test_user, contract_in_state):
    acc = _make_account(db, test_user.id, "act_visible")
    c = contract_in_state("Created", meta_ads_account_id=acc.id)
    res = client.get(f"/api/contracts/{c.id}")
    assert res.status_code == 200
    assert res.json()["meta_ads_account_id"] == acc.id


def test_contract_response_meta_account_id_is_none_when_unset(client, contract_in_state):
    c = contract_in_state("Created")   # no account attached
    res = client.get(f"/api/contracts/{c.id}")
    assert res.status_code == 200
    assert res.json()["meta_ads_account_id"] is None
