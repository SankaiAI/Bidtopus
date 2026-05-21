"""
One-shot data migration: copy DEV Neon branch → MAIN Neon branch.

Creates the schema on MAIN by reflecting DEV's actual schema (which has UUID
types that the ORM declares as String(36) — DEV is the source of truth), then
copies every row in FK-safe order. Verifies row counts at the end.

Reads connection strings from env vars NEON_DEV_URL and NEON_MAIN_URL so no
credentials ever land in source. Get them via:
    neonctl connection-string --project-id <id> --branch dev  --pooled
    neonctl connection-string --project-id <id> --branch main --pooled

Run from backend/ with the venv active:
    NEON_DEV_URL=... NEON_MAIN_URL=... python scripts/copy_dev_to_main.py [--apply]

Without --apply, runs in dry-run mode: shows row counts on both sides and
what would be copied, without writing anything.
"""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, MetaData, Table, text

# Import all ORM models so Base.metadata knows every table
from db.session import Base
from db.models import (  # noqa: F401 — side-effect: registers tables
    User, MetaAdsAccount, PerformanceContract, UnderwritingResult, AgentOffer,
    EscrowRecord, StrategyPlan, PerformanceSnapshot, ResolutionRecord,
    ContractMessage, AuditEvent, WalletConnectNonce,
)

DEV = os.environ.get("NEON_DEV_URL")
MAIN = os.environ.get("NEON_MAIN_URL")
if not DEV or not MAIN:
    print(
        "error: set NEON_DEV_URL and NEON_MAIN_URL env vars before running.\n"
        "  fetch with:  neonctl connection-string --project-id <id> --branch <dev|main> --pooled",
        file=sys.stderr,
    )
    sys.exit(2)

# FK-safe insertion order. Parents before children.
ORDER = [
    "users",
    "meta_ads_accounts",
    "performance_contracts",
    "agent_offers",
    "escrow_records",
    "strategy_plans",
    "performance_snapshots",
    "resolution_records",
    "underwriting_results",
    "contract_messages",
    "audit_events",
    "wallet_connect_nonces",
]


def row_counts(engine, label):
    out = {}
    with engine.connect() as conn:
        existing = set(conn.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname='public'"
        )).scalars().all())
        for t in ORDER:
            if t not in existing:
                out[t] = None  # table doesn't exist
                continue
            out[t] = conn.execute(text(f'SELECT count(*) FROM "{t}"')).scalar()
    return out


def print_counts(label, counts):
    print(f"--- {label} ---")
    for t in ORDER:
        c = counts.get(t)
        marker = "(no table)" if c is None else f"rows={c}"
        print(f"  {t:30s} {marker}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="Actually create schema + copy data. Without this, dry-run.")
    args = parser.parse_args()

    dev_engine = create_engine(DEV)
    main_engine = create_engine(MAIN)

    print("INVENTORY before any changes:\n")
    dev_counts = row_counts(dev_engine, "DEV")
    main_counts_before = row_counts(main_engine, "MAIN")
    print_counts("DEV (source)", dev_counts)
    print_counts("MAIN (target, before)", main_counts_before)

    # Sanity guards
    nonempty_main = [t for t, c in main_counts_before.items() if c]
    if nonempty_main:
        print()
        print(f"[ABORT] MAIN already has data in: {nonempty_main}")
        print("Refusing to copy on top of existing data — would create FK conflicts.")
        print("If MAIN really should be wiped, do it manually first.")
        sys.exit(1)

    if not args.apply:
        print()
        print("[dry-run] No changes made. Pass --apply to execute the copy.")
        return

    # 1. Reflect DEV's actual schema (UUID types, FKs, constraints) and create on MAIN.
    # We don't use Base.metadata.create_all() because the ORM declares many id/FK columns
    # as String(36) while DEV's actual columns are uuid (someone hand-altered them long ago).
    # Reflecting DEV is the source of truth for "what the schema actually looks like."
    print()
    print("[1/3] Reflecting DEV schema -> creating tables on MAIN ...")
    dev_meta = MetaData()
    dev_meta.reflect(bind=dev_engine)
    dev_meta.create_all(bind=main_engine)
    print(f"      done. {len(dev_meta.tables)} table(s) created.")

    # 2. Copy data table by table, FK-safe order, transactional per-table
    print()
    print("[2/3] Copying data DEV -> MAIN ...")

    meta = dev_meta   # already reflected and matches both sides now

    with dev_engine.connect() as dev_conn, main_engine.connect() as main_conn:
        for tname in ORDER:
            tbl: Table = meta.tables[tname]
            cols = [c.name for c in tbl.columns]
            col_list = ", ".join('"' + c + '"' for c in cols)
            select_sql = f'SELECT {col_list} FROM "{tname}"'
            rows = dev_conn.execute(text(select_sql)).mappings().all()
            if not rows:
                print(f"      {tname:30s} skipped (empty in DEV)")
                continue

            txn = main_conn.begin()
            try:
                main_conn.execute(tbl.insert(), [dict(r) for r in rows])
                txn.commit()
                print(f"      {tname:30s} copied {len(rows)} row(s)")
            except Exception as e:
                txn.rollback()
                print(f"      {tname:30s} FAILED: {e}", file=sys.stderr)
                raise

    # 3. Verify
    print()
    print("[3/3] Verifying row counts ...")
    main_counts_after = row_counts(main_engine, "MAIN")
    mismatches = []
    for t in ORDER:
        d = dev_counts.get(t) or 0
        m = main_counts_after.get(t) or 0
        ok = d == m
        marker = "OK" if ok else "MISMATCH"
        print(f"      {t:30s} dev={d}  main={m}  {marker}")
        if not ok:
            mismatches.append(t)

    print()
    if mismatches:
        print(f"[FAIL] {len(mismatches)} table(s) have mismatched counts: {mismatches}")
        sys.exit(2)
    print("[ok] All tables copied successfully. DEV and MAIN now match.")


if __name__ == "__main__":
    main()
