"""
Happy-path acceptance + regression for the UUID-vs-str comparison bug (issue #74).

Under Postgres, AgentOffer.id hydrates as uuid.UUID, so the original
`offer.id != offer_id_str` comparison was always True and every valid /accept
call returned 400. SQLite hydrates String(36) as plain str, so the integration
test alone would have passed against either the buggy or the fixed code —
the second test forces the UUID shape to truly guard against regressions.
"""
import uuid
from types import SimpleNamespace

from db.models import AgentOffer


def _make_offer(db, contract_id, offer_type="accept"):
    offer = AgentOffer(
        contract_id=contract_id,
        offer_type=offer_type,
        message="Looks good.",
    )
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return offer


def test_accept_offer_happy_path(client, db, contract_in_state):
    """Matching offer_id transitions Offered → FundedPending and returns 200."""
    c = contract_in_state("Offered")
    offer = _make_offer(db, c.id)

    res = client.post(f"/api/contracts/{c.id}/accept", json={"offer_id": offer.id})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "FundedPending"


def test_accept_offer_handles_uuid_typed_id(monkeypatch, client, db, contract_in_state):
    """Regression for #74: services.accept_offer must coerce uuid.UUID → str before comparing."""
    c = contract_in_state("Offered")
    offer = _make_offer(db, c.id)
    canonical_id = str(offer.id)

    # Simulate Postgres hydration: swap the offer row with a UUID-typed id.
    import services.contract_service as svc
    real_get = svc.repo.get_latest_agent_offer

    def _fake_get(db_, contract_id_):
        row = real_get(db_, contract_id_)
        if row is None:
            return None
        return SimpleNamespace(id=uuid.UUID(str(row.id)), offer_type=row.offer_type)

    monkeypatch.setattr(svc.repo, "get_latest_agent_offer", _fake_get)

    res = client.post(f"/api/contracts/{c.id}/accept", json={"offer_id": canonical_id})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "FundedPending"


def test_accept_offer_rejects_mismatched_offer_id(client, db, contract_in_state):
    """Comparison still rejects a non-matching offer_id with 400."""
    c = contract_in_state("Offered")
    _make_offer(db, c.id)

    res = client.post(
        f"/api/contracts/{c.id}/accept",
        json={"offer_id": str(uuid.uuid4())},
    )
    assert res.status_code == 400
