import sqlite3, os
conn = sqlite3.connect(os.path.join(os.path.dirname(__file__), "ams.db"))
c = conn.cursor()

c.execute("""
CREATE TABLE IF NOT EXISTS service_reports (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    field_report_id      INTEGER REFERENCES field_reports(id),
    task_id              INTEGER REFERENCES tasks(id),
    employee_id          INTEGER REFERENCES employees(id),
    school_id            INTEGER REFERENCES schools(id),
    report_date          DATE,
    problem_description  TEXT,
    observation          TEXT,
    action_taken         TEXT,
    spare_parts          TEXT,
    tds_input            REAL,
    tds_output           REAL,
    voltage              REAL,
    flow_rate            REAL,
    technician_signature TEXT,
    principal_signature  TEXT,
    principal_name       TEXT,
    pdf_path             TEXT,
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP
)
""")

conn.commit()
conn.close()
print("Done — service_reports table ready.")
