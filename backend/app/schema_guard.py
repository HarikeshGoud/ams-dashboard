"""Bring an existing database up to date with the models, additively.

This project has no Alembic and no migration files. Base.metadata.create_all() creates
missing TABLES but never adds a missing COLUMN to a table that already exists, so every
new column so far has had to be applied to Neon by hand. That is easy to forget and the
failure is ugly: the app deploys green and then every request touching the new column
dies with "column does not exist".

This runs at startup and adds only what is missing. It is deliberately narrow:

  * ADD COLUMN only — never drops, renames, retypes or moves data.
  * Every entry is explicit. Nothing is inferred from the models, so a model change can't
    silently rewrite the production schema as a side effect.
  * Safe to run on every boot, and safe to run concurrently on several instances.

Postgres has ADD COLUMN IF NOT EXISTS. SQLite does not, so there the existing columns are
read from PRAGMA table_info first and present ones are skipped.
"""
import logging
from sqlalchemy import inspect, text

logger = logging.getLogger("ams")

# (table, column, type, extra) — extra carries REFERENCES for a foreign key.
# Keep the type spelling valid in BOTH Postgres and SQLite; INTEGER and TEXT are.
REQUIRED_COLUMNS = [
    # A technician who looks after one site every day instead of rotating through mandals.
    # Their daily task generation is that single site — see tasks.py.
    ("employees", "dedicated_school_id", "INTEGER", "REFERENCES schools(id)"),
]


def ensure_columns(engine) -> list:
    """Add any missing column from REQUIRED_COLUMNS. Returns what it added."""
    added = []
    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
        is_sqlite = engine.dialect.name == "sqlite"

        for table, column, coltype, extra in REQUIRED_COLUMNS:
            if table not in existing_tables:
                # create_all hasn't made it yet, or the name is wrong. Either way the
                # column will come with the table — don't guess.
                continue

            if is_sqlite:
                have = {c["name"] for c in inspector.get_columns(table)}
                if column in have:
                    continue
                ddl = f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"
                if extra:
                    ddl += f" {extra}"
            else:
                ddl = (f"ALTER TABLE {table} "
                       f"ADD COLUMN IF NOT EXISTS {column} {coltype}")
                if extra:
                    ddl += f" {extra}"

            try:
                with engine.begin() as conn:
                    conn.execute(text(ddl))
                added.append(f"{table}.{column}")
            except Exception as e:
                # One bad column must not stop the app from starting, or a typo here
                # takes the whole service down. Log loudly and carry on.
                logger.error(f"[schema] could not add {table}.{column}: {e}")

        if added:
            logger.warning(f"[schema] added missing column(s): {', '.join(added)}")
    except Exception as e:
        logger.error(f"[schema] column check skipped: {e}")
    return added
