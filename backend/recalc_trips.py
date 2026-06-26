import sqlite3, os
conn = sqlite3.connect(os.path.join(os.path.dirname(__file__), "ams.db"))
c = conn.cursor()

settings = c.execute("SELECT rate_per_km, fuel_price FROM fuel_settings ORDER BY id DESC LIMIT 1").fetchone()
print("Current settings: rate_per_km =", settings[0], "fuel_price =", settings[1])

rate = settings[0] if settings else 0
fuel = settings[1] if settings else 105

trips = c.execute("SELECT id, distance_km, mileage_used FROM travel_trips WHERE status='pending'").fetchall()
for tid, km, mileage in trips:
    km = float(km or 0)
    mileage = float(mileage or 45)
    if rate and rate > 0:
        new_amount = round(km * rate, 2)
        c.execute("UPDATE travel_trips SET amount=?, calculated_amount=?, rate_per_km_used=? WHERE id=?",
                  (new_amount, new_amount, rate, tid))
        print(f"Trip {tid}: {km} km × Rs.{rate}/km = Rs.{new_amount}")
    else:
        new_amount = round((km / mileage) * fuel + 50, 2) if mileage > 0 else 50
        c.execute("UPDATE travel_trips SET amount=?, calculated_amount=?, rate_per_km_used=NULL, fuel_price_used=? WHERE id=?",
                  (new_amount, new_amount, fuel, tid))
        print(f"Trip {tid}: ({km}/{mileage}) × {fuel} + 50 = Rs.{new_amount}")

conn.commit()
conn.close()
print("Done.")
