"""
Migration 3: add home_lat/home_lng to employees, trip_type to travel_trips
Run: python run_travel_migration3.py
"""
import sqlite3, os

DB = os.path.join(os.path.dirname(__file__), "ams.db")
conn = sqlite3.connect(DB)
c = conn.cursor()

cols = {row[1] for row in c.execute("PRAGMA table_info(employees)")}
for col, defn in [("home_lat", "REAL"), ("home_lng", "REAL")]:
    if col not in cols:
        c.execute(f"ALTER TABLE employees ADD COLUMN {col} {defn}")
        print(f"Added employees.{col}")

cols2 = {row[1] for row in c.execute("PRAGMA table_info(travel_trips)")}
if "trip_type" not in cols2:
    c.execute("ALTER TABLE travel_trips ADD COLUMN trip_type TEXT DEFAULT 'manual'")
    print("Added travel_trips.trip_type")

conn.commit()
conn.close()
print("Migration 3 done.")
