from app.database import SessionLocal
from app.models.task import Task
from app.models.employee import Employee

db = SessionLocal()

# Check Ravi Kumar EMP002
emp = db.query(Employee).filter(Employee.employee_code == "EMP002").first()
print(f"Employee: {emp.name} id={emp.id} active={emp.is_active}")

# Check tasks assigned to this id
tasks = db.query(Task).filter(Task.assigned_to_id == emp.id).all()
print(f"Tasks assigned to id={emp.id}: {len(tasks)}")
for t in tasks:
    print(f"  - [{t.id}] {t.title} | status={t.status} | due={t.due_date}")

# All tasks
print("\nAll tasks in DB:")
for t in db.query(Task).all():
    print(f"  - [{t.id}] {t.title} | assigned_to_id={t.assigned_to_id} | status={t.status}")

db.close()
