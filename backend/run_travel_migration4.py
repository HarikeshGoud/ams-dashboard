import sqlite3, os
conn = sqlite3.connect(os.path.join(os.path.dirname(__file__), "ams.db"))
c = conn.cursor()

cols = {row[1] for row in c.execute("PRAGMA table_info(fuel_settings)")}
if "rate_per_km" not in cols:
    c.execute("ALTER TABLE fuel_settings ADD COLUMN rate_per_km REAL DEFAULT 0.0")
    print("Added fuel_settings.rate_per_km")

cols2 = {row[1] for row in c.execute("PRAGMA table_info(travel_trips)")}
if "rate_per_km_used" not in cols2:
    c.execute("ALTER TABLE travel_trips ADD COLUMN rate_per_km_used REAL")
    print("Added travel_trips.rate_per_km_used")

conn.commit()
conn.close()
print("Migration 4 done.")
