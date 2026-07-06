"""Generate today's tasks directly into live PostgreSQL, mimicking generate-daily logic."""
import psycopg2
from datetime import date

PG_URL = 'postgresql://neondb_owner:npg_uKZr0B6gyCeS@ep-fancy-wildflower-aokefnrg.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
pg = psycopg2.connect(PG_URL)
cur = pg.cursor()

today = date.today()
DAILY_DEFAULT = 5
total_created = 0

# Get active technicians
cur.execute("SELECT id, name FROM employees WHERE role='technician' AND is_active=true ORDER BY id")
technicians = cur.fetchall()
print(f"Active technicians: {len(technicians)}")

for emp_id, emp_name in technicians:
    # Check existing tasks today
    cur.execute("""
        SELECT COUNT(*) FROM tasks
        WHERE assigned_to_id=%s AND due_date=%s AND status != 'cancelled'
    """, (emp_id, today))
    existing = cur.fetchone()[0]

    if existing >= DAILY_DEFAULT:
        print(f"  SKIP {emp_name}: already has {existing} tasks")
        continue

    slots_needed = DAILY_DEFAULT - existing

    # Get schools already assigned today
    cur.execute("""
        SELECT school_id FROM tasks
        WHERE assigned_to_id=%s AND due_date=%s AND status != 'cancelled' AND school_id IS NOT NULL
    """, (emp_id, today))
    already_today = {r[0] for r in cur.fetchall()}

    # Get pending/in-progress school ids (in rotation)
    cur.execute("""
        SELECT school_id FROM tasks
        WHERE assigned_to_id=%s AND status IN ('pending','in_progress') AND school_id IS NOT NULL
    """, (emp_id,))
    pending_school_ids = {r[0] for r in cur.fetchall()}

    # Get all schools for this technician
    cur.execute("""
        SELECT id, name, last_visit_date FROM schools
        WHERE technician_id=%s AND is_active=true
        ORDER BY name
    """, (emp_id,))
    all_schools = cur.fetchall()  # (id, name, last_visit_date)

    if not all_schools:
        print(f"  SKIP {emp_name}: no schools assigned")
        continue

    # Rotation: unvisited first (no last_visit_date AND not in pending)
    unvisited = [s for s in all_schools if s[2] is None and s[0] not in pending_school_ids]
    new_round = len(unvisited) == 0

    if new_round:
        eligible = sorted(all_schools, key=lambda s: s[2] or date.min)
    else:
        eligible = sorted(unvisited, key=lambda s: s[1])

    eligible = [s for s in eligible if s[0] not in already_today and s[0] not in pending_school_ids]

    created = 0
    for school_id, school_name, _ in eligible[:slots_needed]:
        cur.execute("""
            INSERT INTO tasks (title, description, assigned_to_id, assigned_by_id, school_id, priority, status, due_date, created_at)
            VALUES (%s, %s, %s, NULL, %s, 'medium', 'pending', %s, NOW())
        """, (f"Visit {school_name}", "Daily scheduled visit", emp_id, school_id, today))
        created += 1

    pg.commit()
    total_created += created
    print(f"  {emp_name}: created {created} tasks (new_round={new_round}, eligible={len(eligible)})")

print(f"\nTotal tasks created: {total_created}")

# Verify
cur.execute("SELECT COUNT(*) FROM tasks WHERE due_date=%s", (today,))
print(f"Tasks in DB for today ({today}): {cur.fetchone()[0]}")

pg.close()
