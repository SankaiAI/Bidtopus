"""
One-shot cleanup: delete historic agent-side duplicate offer-message rows.

Background: until issue #83 landed (agent commit), both the agent component
and backend independently persisted the same agent acceptance message to
contract_messages. Agent's row carried `extras = {offer_type, probability,
revised_threshold, revised_fee_usdc, revised_time_window_days}`; backend's
row carried `extras = {offer_id, offer_type}`. Frontend's Accept-offer card
reads `extras.offer_id`, so backend's row is the canonical one; agent's row
is a leftover the merchant sees as a duplicate bubble on workspace restore.

The agent fix removed the producer of the agent-shape row. This script
deletes the historic rows that producer wrote, leaving backend's row intact.

Safety:
- Dry-run by default. Pass --apply to actually delete.
- For each candidate delete, we require a matching backend-shape row
  (same contract_id, same content) to exist. If not, the candidate is
  KEPT (because then it's the only copy of the merchant-visible bubble
  and deleting it would lose data).
- Prints a per-contract summary before and after.

Usage:
    python scripts/cleanup_duplicate_offer_messages.py             # dry-run
    python scripts/cleanup_duplicate_offer_messages.py --apply     # delete
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db.models import ContractMessage
from db.session import SessionLocal


# Distinctive key only the agent-shape row contained
AGENT_SHAPE_KEY = "probability"
# Distinctive key only backend's canonical row carries
BACKEND_SHAPE_KEY = "offer_id"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="Actually delete rows. Without this flag the script is a dry-run.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        candidates = (
            db.query(ContractMessage)
            .filter(ContractMessage.role == "agent", ContractMessage.type == "message")
            .all()
        )
        agent_shape = [m for m in candidates if (m.extra or {}).get(AGENT_SHAPE_KEY) is not None]
        backend_shape = [m for m in candidates if (m.extra or {}).get(BACKEND_SHAPE_KEY) is not None]

        # Index backend rows by (contract_id, content) for O(1) sibling lookup
        backend_by_key = {(str(m.contract_id), m.content or ""): m for m in backend_shape}

        deletable: list[ContractMessage] = []
        orphans: list[ContractMessage] = []
        for m in agent_shape:
            key = (str(m.contract_id), m.content or "")
            if key in backend_by_key:
                deletable.append(m)
            else:
                orphans.append(m)

        print(f"agent-shape rows  (probability key): {len(agent_shape)}")
        print(f"backend-shape rows (offer_id key)  : {len(backend_shape)}")
        print(f"deletable (have a backend sibling) : {len(deletable)}")
        print(f"orphans  (no sibling, kept as-is)  : {len(orphans)}")

        if orphans:
            print()
            print("[warn] the following agent-shape rows have NO matching backend row")
            print("       and will be KEPT (deleting them would lose merchant-visible data):")
            for m in orphans[:20]:
                print(f"  contract={str(m.contract_id)[:8]}  msg_id={str(m.id)[:8]}  ts={m.created_at}")
            if len(orphans) > 20:
                print(f"  ... ({len(orphans) - 20} more)")

        if not args.apply:
            print()
            print("[dry-run] no rows deleted. Pass --apply to delete the deletable set.")
            return

        if not deletable:
            print()
            print("[ok] nothing to delete.")
            return

        ids = [m.id for m in deletable]
        db.query(ContractMessage).filter(ContractMessage.id.in_(ids)).delete(
            synchronize_session=False,
        )
        db.commit()
        print()
        print(f"[ok] deleted {len(ids)} agent-shape duplicate rows.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
