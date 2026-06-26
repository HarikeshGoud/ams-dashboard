"""
Batch geocode all schools without lat/lng using Nominatim (OpenStreetMap).
Run: python geocode_schools.py
Respects Nominatim ToS: 1 request/second max.
"""
import sqlite3, time, urllib.request, urllib.parse, json, os, sys

DB = os.path.join(os.path.dirname(__file__), "ams.db")

def nominatim_geocode(name, mandal, district="Nalgonda", state="Telangana"):
    """Try progressively simpler queries until one returns a result."""
    queries = [
        f"{name}, {mandal}, {district}, {state}, India",
        f"{name}, {district}, {state}, India",
        f"{name}, {state}, India",
    ]
    headers = {"User-Agent": "AMS-Dashboard/1.0 (water purifier management, Telangana)"}
    for q in queries:
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
            "q": q, "format": "json", "limit": "1", "countrycodes": "in"
        })
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"]), q
        except Exception as e:
            pass
        time.sleep(1)  # Nominatim rate limit: 1 req/sec
    return None, None, None

def main():
    conn = sqlite3.connect(DB)
    c = conn.cursor()

    rows = c.execute("""
        SELECT s.id, s.name, m.name as mandal
        FROM schools s
        LEFT JOIN mandals m ON s.mandal_id = m.id
        WHERE s.latitude IS NULL OR s.longitude IS NULL
        ORDER BY s.id
    """).fetchall()

    total = len(rows)
    print(f"Schools without coordinates: {total}")

    if total == 0:
        print("All schools already have coordinates!")
        conn.close()
        return

    found = 0
    not_found = []

    for i, (school_id, name, mandal) in enumerate(rows):
        lat, lng, matched_query = nominatim_geocode(name, mandal or "Nalgonda")
        if lat and lng:
            c.execute("UPDATE schools SET latitude=?, longitude=? WHERE id=?", (lat, lng, school_id))
            conn.commit()
            found += 1
            print(f"[{i+1}/{total}] ✅ {name} → {lat:.5f}, {lng:.5f}  ({matched_query})")
        else:
            not_found.append(name)
            print(f"[{i+1}/{total}] ❌ {name} — not found")
        time.sleep(1)  # Nominatim ToS

    print(f"\nDone. Found: {found}/{total}")
    if not_found:
        print(f"Not found ({len(not_found)}):")
        for n in not_found:
            print(f"  - {n}")
    conn.close()

if __name__ == "__main__":
    main()
