"""
Dev helper: mock the on-chain fund step for a contract in FundedPending.

Writes the same DB state that a successful fund_escrow() call would produce
(EscrowRecord, contract.status='Funded', funded_at, audit event, system
message) without requiring a real on-chain USDC transfer, then runs the
strategy-generation flow synchronously so the contract reaches the
"approve strategy" step.

Usage:
    python scripts/dev_mock_fund.py <contract_id> [--amount N] [--no-strategy]
"""
import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

# Make `backend/` importable regardless of CWD
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import db.messages_repo as messages_repo
import db.repo as repo
from db.models import EscrowRecord
from db.session import SessionLocal


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("contract_id", help="UUID of the contract to mock-fund")
    parser.add_argument("--amount", type=float, default=None,
                        help="Mock USDC amount; defaults to contract.success_fee_usdc")
    parser.add_argument("--no-strategy", action="store_true",
                        help="Skip the synchronous strategy-generation kick after mocking")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        contract = repo.get_contract(db, args.contract_id)
        if contract is None:
            print(f"error: contract {args.contract_id} not found", file=sys.stderr)
            sys.exit(1)
        if contract.status != "FundedPending":
            print(f"error: contract status is {contract.status!r}, not 'FundedPending' — "
                  f"refusing to mock", file=sys.stderr)
            sys.exit(1)

        existing = db.query(EscrowRecord).filter_by(contract_id=contract.id).first()
        if existing is not None:
            print(f"error: contract already has an escrow record "
                  f"({existing.id}, status={existing.status}) — refusing to double-mock",
                  file=sys.stderr)
            sys.exit(1)

        amount = args.amount if args.amount is not None else (contract.success_fee_usdc or 10.0)
        cid_hex = str(contract.id).replace("-", "")
        mock_tx = ("0xM0CK" + cid_hex).ljust(66, "0")[:66]
        mock_chain_id = ("0xCHA1N" + cid_hex).ljust(66, "0")[:66]

        record = repo.create_escrow_record(
            db,
            contract_id=contract.id,
            chain_contract_id=mock_chain_id,
            tx_hash=mock_tx,
            amount_usdc=amount,
            status="funded",
        )
        repo.update_contract_status(
            db, contract.id, "Funded", funded_at=datetime.now(timezone.utc),
        )
        repo.log_audit_event(db, contract.id, "arc_escrow", "result", {
            "tx_hash": mock_tx,
            "chain_contract_id": mock_chain_id,
            "amount_usdc": amount,
            "mock": True,
        })
        messages_repo.append(
            db, contract.id, "system", "system_event",
            content=f"Escrow funded (MOCK) — {amount} USDC locked (dev mock, no on-chain tx)",
            extra={"tx_hash": mock_tx, "chain_contract_id": mock_chain_id, "mock": True},
        )

        print(f"[ok] escrow_id={record.id} amount={amount} USDC contract={contract.id}")
        print(f"[ok] status: FundedPending -> Funded")
    finally:
        db.close()

    if args.no_strategy:
        print("[skip] --no-strategy passed; not generating strategy")
        return

    # Run strategy generation synchronously (in-thread) so we don't exit before it finishes.
    # The real fund flow uses _bg() to fire-and-forget — we just call the same function inline.
    from services.contract_service import _generate_strategy_bg
    print("[run] generating strategy synchronously (this calls the LLM and may take ~20-60s)...")
    _generate_strategy_bg(str(contract.id))
    print("[ok] strategy generation done. Reload the workspace UI to see the plan card.")


if __name__ == "__main__":
    main()
