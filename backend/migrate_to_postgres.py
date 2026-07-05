# -*- coding: utf-8 -*-
"""
Migrate all data from local SQLite (ams.db) to Neon PostgreSQL (live site).
Run: python migrate_to_postgres.py
"""
import sqlite3
import os
import sys

PG_URL = "postgresql://neondb_owner:npg_uKZr0B6gyCeS@ep-fancy-wildflower-aokefnrg.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    os.system(f"{sys.executable} -m pip install psycopg2-binary")
    import psycopg2
    import psycopg2.extras

sqlite_path = os.path.join(os.path.dirname(__file__), "ams.db")

# Insert order respects foreign key dependencies
TABLE_ORDER = [
    "mandals",
    "clients",
    "employees",
    "schools",
    "employee_mandals",
    "stock_items",
    "fuel_settings",
    "tasks",
    "field_reports",
    "work_proofs",
    "attendance",
    "travel_trips",
    "visits",
    "service_reports",
    "amc_reports",
    "allowance_requests",
    "notifications",
    "salary_overrides",
    "salary_records",
    "invoices",
    "invoice_line_items",
    "stock_ledger",
    "stock_usages",
    "complaints",
    "payments",
]

def log(msg):
    print(msg, flush=True)

def migrate():
    log("Connecting to SQLite...")
    sq = sqlite3.connect(sqlite_path)
    sq.row_factory = sqlite3.Row
    sq_cur = sq.cursor()

    log("Connecting to PostgreSQL (Neon)...")
    pg = psycopg2.connect(PG_URL)
    pg.autocommit = False
    pg_cur = pg.cursor()

    # Get boolean columns from PostgreSQL so we can convert 0/1
    pg_cur.execute("""
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type = 'boolean'
    """)
    bool_cols = {(r[0], r[1]) for r in pg_cur.fetchall()}
    log(f"Found {len(bool_cols)} boolean columns in PostgreSQL")

    # Truncate all tables in reverse order
    log("\nClearing existing PostgreSQL data...")
    for table in reversed(TABLE_ORDER):
        try:
            pg_cur.execute(f'TRUNCATE TABLE "{table}" RESTART IDENTITY CASCADE;')
            pg.commit()
            log(f"  Cleared: {table}")
        except Exception as e:
            pg.rollback()
            log(f"  Skip clear {table}: {e}")

    log("\nMigrating tables...")
    for table in TABLE_ORDER:
        # Check table exists in SQLite
        sq_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
        if not sq_cur.fetchone():
            log(f"  SKIP {table} (not in SQLite)")
            continue

        sq_cur.execute(f"SELECT * FROM {table}")
        rows = sq_cur.fetchall()
        if not rows:
            log(f"  {table}: 0 rows")
            continue

        sq_cols = [d[0] for d in sq_cur.description]

        # Check table exists in PostgreSQL
        pg_cur.execute("""
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
        """, (table,))
        pg_col_info = {r[0]: r[1] for r in pg_cur.fetchall()}

        if not pg_col_info:
            log(f"  SKIP {table} (not in PostgreSQL)")
            continue

        # Only migrate columns that exist in both
        common_cols = [c for c in sq_cols if c in pg_col_info]
        col_str = ", ".join(f'"{c}"' for c in common_cols)
        placeholders = ", ".join(["%s"] * len(common_cols))
        col_indices = [sq_cols.index(c) for c in common_cols]

        # Build data, converting booleans
        data = []
        for row in rows:
            row_list = list(row)
            vals = []
            for i, col in zip(col_indices, common_cols):
                v = row_list[i]
                # Convert SQLite 0/1 integers to Python bool for PostgreSQL boolean cols
                if (table, col) in bool_cols and isinstance(v, int):
                    v = bool(v)
                vals.append(v)
            data.append(tuple(vals))

        try:
            psycopg2.extras.execute_values(
                pg_cur,
                f'INSERT INTO "{table}" ({col_str}) VALUES %s ON CONFLICT DO NOTHING',
                data,
                template=f"({placeholders})"
            )
            pg.commit()
            log(f"  {table}: {len(data)} rows OK")
        except Exception as e:
            pg.rollback()
            log(f"  {table}: BATCH ERROR - {e}")
            # Try row by row
            ok = 0
            for row_data in data:
                try:
                    pg_cur.execute(
                        f'INSERT INTO "{table}" ({col_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING',
                        row_data
                    )
                    pg.commit()
                    ok += 1
                except Exception as e2:
                    pg.rollback()
            log(f"    Row-by-row: {ok}/{len(data)} inserted")

    # Reset sequences to max(id) so new rows don't collide
    log("\nResetting sequences...")
    pg_cur.execute("""
        SELECT sequence_name FROM information_schema.sequences
        WHERE sequence_schema = 'public'
    """)
    seqs = [r[0] for r in pg_cur.fetchall()]
    for seq in seqs:
        try:
            # Derive table name from sequence (table_col_seq pattern)
            parts = seq.rsplit("_", 2)
            if len(parts) >= 2:
                tbl = parts[0]
                pg_cur.execute(f"""
                    SELECT COALESCE(MAX(id), 1) FROM "{tbl}"
                """)
                max_id = pg_cur.fetchone()[0]
                pg_cur.execute(f"SELECT setval('{seq}', {max_id}, true)")
                pg.commit()
                log(f"  {seq} reset to {max_id}")
        except Exception as e:
            pg.rollback()
            log(f"  {seq}: skip ({e})")

    sq.close()
    pg.close()
    log("\nDone! Migration complete.")

if __name__ == "__main__":
    migrate()
