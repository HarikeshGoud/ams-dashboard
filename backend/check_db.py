import sqlite3
conn = sqlite3.connect("ams.db")
cur = conn.cursor()
tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
print(f"TABLES ({len(tables)}):")
for t in tables:
    cols = [r[1] for r in cur.execute(f"PRAGMA table_info({t})").fetchall()]
    print(f"  {t} ({len(cols)} cols): {', '.join(cols)}")
conn.close()
