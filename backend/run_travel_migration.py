"""Migration: add smart travel fields to travel_trips, employees; create fuel_settings table."""
import sqlite3, os

DB = os.path.join(os.path.dirname(__file__), "ams.db")
conn = sqlite3.connect(DB)
c = conn.cursor()

# travel_trips new columns
travel_cols = [
    ("route_legs",        "TEXT"),
    ("fuel_price_used",   "REAL"),
    ("mileage_used",      "REAL"),
    ("calculated_amount", "REAL"),
    ("start_lat",         "REAL"),
    ("start_lng",         "REAL"),
]
existing = {r[1] for r in c.execute("PRAGMA table_info(travel_trips)")}
for col, typ in travel_cols:
    if col not in existing:
        c.execute(f"ALTER TABLE travel_trips ADD COLUMN {col} {typ}")
        print(f"  + travel_trips.{col}")

# employees new columns
emp_cols = [
    ("bike_mileage",  "REAL DEFAULT 45.0"),
    ("home_location", "TEXT"),
]
existing_emp = {r[1] for r in c.execute("PRAGMA table_info(employees)")}
for col, typ in emp_cols:
    if col not in existing_emp:
        c.execute(f"ALTER TABLE employees ADD COLUMN {col} {typ}")
        print(f"  + employees.{col}")

# fuel_settings table
c.execute("""
CREATE TABLE IF NOT EXISTS fuel_settings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    fuel_price REAL    DEFAULT 105.0,
    set_by     INTEGER,
    updated_at TEXT    DEFAULT (datetime('now'))
)
""")
# seed one default row if empty
row = c.execute("SELECT COUNT(*) FROM fuel_settings").fetchone()[0]
if row == 0:
    c.execute("INSERT INTO fuel_settings (fuel_price) VALUES (105.0)")
    print("  + fuel_settings seeded with default Rs.105/litre")

conn.commit()
conn.close()
print("Migration complete.")
