import sqlite3
conn = sqlite3.connect("ams.db")
cur = conn.cursor()
cols = [
    ("invoices",    "employee_id",       "INTEGER"),
    ("invoices",    "school_name",       "VARCHAR(200)"),
    ("attendance",  "tasks_assigned",    "INTEGER"),
    ("attendance",  "tasks_completed",   "INTEGER"),
    ("attendance",  "attendance_value",  "REAL"),
    ("attendance",  "attendance_label",  "VARCHAR(20)"),
    ("schools",     "last_visit_date",   "DATE"),
    ("field_reports", "item_installed",       "VARCHAR(200)"),
    ("field_reports", "latitude",              "REAL"),
    ("field_reports", "longitude",             "REAL"),
    ("field_reports", "task_id",               "INTEGER"),
    ("field_reports", "verification_status",   "VARCHAR(20)"),
    ("field_reports", "verification_note",     "TEXT"),
    ("field_reports", "verified_at",           "DATETIME"),
    ("field_reports", "whatsapp_sent_at",      "DATETIME"),
    ("work_proofs",   "task_id",               "INTEGER"),
    ("work_proofs",   "photo_type",            "VARCHAR(30)"),
    ("work_proofs",   "latitude",              "REAL"),
    ("work_proofs",   "longitude",             "REAL"),
    ("work_proofs",   "employee_id",           "INTEGER"),
    ("employees",     "employee_code",         "VARCHAR(20)"),
    ("schools",       "unit_number",           "VARCHAR(20)"),
    ("schools",       "plant_condition",       "VARCHAR(20)"),
    ("visits",        "plant_condition",       "VARCHAR(20)"),
    ("visits",        "not_working_reason",    "TEXT"),
    ("visits",        "mcf_used",              "INTEGER"),
    ("visits",        "antiscalant_used",      "REAL"),
    ("visits",        "spares_used",           "TEXT"),
]
for table, col, dtype in cols:
    try:
        cur.execute("ALTER TABLE {} ADD COLUMN {} {}".format(table, col, dtype))
        print("Added {}.{}".format(table, col))
    except Exception as e:
        print("Skip {}.{}: {}".format(table, col, e))
conn.commit()
conn.close()
print("Done.")
