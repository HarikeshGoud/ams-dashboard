import sqlite3
c = sqlite3.connect('ams.db')
tbls = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
for t in tbls:
    count = c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    print(f"{t}: {count}")
c.close()
