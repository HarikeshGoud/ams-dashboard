from app.database import SessionLocal
from app.models.task import Task
from app.models.employee import Employee
db = SessionLocal()
tasks = db.query(Task).all()
for t in tasks:
    emp = db.query(Employee).filter(Employee.id == t.assigned_to_id).first()
    print(f'Task: "{t.title}" -> {emp.name if emp else "?"} [{emp.employee_code if emp else "?"}] id={t.assigned_to_id} | status={t.status}')
print("OK")
db.close()
