import sqlite3, os
conn = sqlite3.connect(os.path.join(os.path.dirname(__file__), "ams.db"))
c = conn.cursor()
c.execute("DELETE FROM travel_trips WHERE trip_type = 'manual' OR trip_type IS NULL")
print("Deleted:", c.rowcount, "manual trips")
conn.commit()
conn.close()
