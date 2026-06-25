import pandas as pd, sqlite3
DB = r'C:\Users\vinutha marpally\OneDrive\Documents\Projects\ams-dashboard\backend\ams.db'
XL = r'C:\Users\vinutha marpally\Downloads\UNIT-01 SCHOOLS WITH TECHNICIAN NAME (1).xlsx'
df = pd.read_excel(XL, sheet_name='Sheet1')
df = df.dropna(subset=['NAME OFTHE SCHOOL'])
df['MANDAL'] = df['MANDAL'].ffill().str.strip()
df['TECHNICIAN NAME'] = df['TECHNICIAN NAME'].ffill().str.strip()

conn = sqlite3.connect(DB)
cur = conn.cursor()

cur.execute('''CREATE TABLE IF NOT EXISTS employee_mandals (
    employee_id INTEGER REFERENCES employees(id),
    mandal_id INTEGER REFERENCES mandals(id),
    PRIMARY KEY (employee_id, mandal_id)
)''')

TECH_CODES = {'NAYEEM':'EMP031','GANESH':'EMP032','KAMALAKAR':'EMP033','MADHU':'EMP034','MAHESH':'EMP035','SURESH':'EMP036'}

emp_map = {}
for tname, code in TECH_CODES.items():
    cur.execute('SELECT id FROM employees WHERE employee_code=?', (code,))
    r = cur.fetchone()
    if r: emp_map[tname] = r[0]

print('emp_map:', emp_map)

cur.execute('SELECT id, name FROM mandals')
mandal_map = {name.strip(): mid for mid, name in cur.fetchall()}
print('mandals in DB:', list(mandal_map.keys())[:15])

cur.execute('DELETE FROM employee_mandals')
added = 0
for tname, grp in df.groupby('TECHNICIAN NAME'):
    emp_id = emp_map.get(tname)
    if not emp_id:
        print(f'No emp_id for tech: {tname}')
        continue
    for mname in grp['MANDAL'].unique():
        mid = mandal_map.get(mname.strip())
        if mid:
            cur.execute('INSERT OR IGNORE INTO employee_mandals (employee_id, mandal_id) VALUES (?,?)', (emp_id, mid))
            added += 1
        else:
            print(f'Mandal not found: {mname!r}')

conn.commit()
print(f'employee_mandals rows added: {added}')
cur.execute('SELECT COUNT(*) FROM employee_mandals'); print('Total:', cur.fetchone()[0])
conn.close()
