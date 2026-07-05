import sqlite3, os
conn = sqlite3.connect(os.path.join(os.path.dirname(__file__), "ams.db"))
c = conn.cursor()

cols = [
    ("report_no",          "TEXT"),
    ("complaint_no",       "TEXT"),
    ("unit_type",          "TEXT DEFAULT 'AMC'"),
    ("plant_capacity",     "TEXT"),
    ("design_rw_tds",      "TEXT"),
    ("free_chlorine_rw",   "TEXT"),
    ("hours_running",      "TEXT"),
    ("membrane_condition", "TEXT DEFAULT 'OK'"),
    ("uv_lamp_condition",  "TEXT DEFAULT 'OK'"),
    ("sensors_condition",  "TEXT DEFAULT 'OK'"),
    ("prefilter_condition","TEXT DEFAULT 'OK'"),
    ("current_amps",       "TEXT"),
    ("customer_mobile",    "TEXT"),
    ("customer_remarks",   "TEXT"),
    ("status",             "TEXT DEFAULT 'PROBLEM RESOLVED'"),
]

existing = [row[1] for row in c.execute("PRAGMA table_info(service_reports)").fetchall()]
for col, col_type in cols:
    if col not in existing:
        c.execute(f"ALTER TABLE service_reports ADD COLUMN {col} {col_type}")
        print(f"Added column: {col}")
    else:
        print(f"Already exists: {col}")

conn.commit()
conn.close()
print("Done.")
