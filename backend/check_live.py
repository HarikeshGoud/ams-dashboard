import psycopg2
PG_URL = 'postgresql://neondb_owner:npg_uKZr0B6gyCeS@ep-fancy-wildflower-aokefnrg.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
pg = psycopg2.connect(PG_URL)
cur = pg.cursor()

# Check tasks table columns and constraints
cur.execute("""
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'tasks' AND table_schema = 'public'
    ORDER BY ordinal_position
""")
print('tasks columns:')
for row in cur.fetchall():
    print(f'  {row[0]}: {row[1]}, nullable={row[2]}, default={row[3]}')

# Try inserting a test task to see if it errors
cur.execute("""
    SELECT id FROM employees WHERE role='technician' AND is_active=true LIMIT 1
""")
emp_row = cur.fetchone()
if emp_row:
    emp_id = emp_row[0]
    cur.execute("""
        SELECT id FROM schools WHERE technician_id=%s AND is_active=true LIMIT 1
    """, (emp_id,))
    sch_row = cur.fetchone()
    if sch_row:
        sch_id = sch_row[0]
        try:
            cur.execute("""
                INSERT INTO tasks (title, description, assigned_to_id, assigned_by_id, school_id, priority, due_date)
                VALUES (%s, %s, %s, %s, %s, %s, CURRENT_DATE)
                RETURNING id
            """, ('Test Visit', 'Daily scheduled visit', emp_id, None, sch_id, 'medium'))
            new_id = cur.fetchone()[0]
            pg.rollback()  # don't keep it
            print(f'\nTest insert SUCCEEDED (rolled back), new id would be {new_id}')
        except Exception as e:
            pg.rollback()
            print(f'\nTest insert FAILED: {e}')

pg.close()
