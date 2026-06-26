import sqlite3
conn = sqlite3.connect("ams.db")
cur = conn.cursor()

sql = (
    "CREATE TABLE IF NOT EXISTS allowance_requests ("
    "id INTEGER PRIMARY KEY AUTOINCREMENT,"
    "employee_id INTEGER NOT NULL REFERENCES employees(id),"
    "amount NUMERIC(10,2) NOT NULL,"
    "reason VARCHAR(300) NOT NULL,"
    "date DATE NOT NULL,"
    "status VARCHAR(20) DEFAULT 'pending',"
    "admin_note TEXT,"
    "reviewed_by INTEGER REFERENCES employees(id),"
    "reviewed_at DATETIME,"
    "created_at DATETIME DEFAULT CURRENT_TIMESTAMP"
    ")"
)
cur.execute(sql)
print("Created allowance_requests table")
conn.commit()
conn.close()
print("Done.")
