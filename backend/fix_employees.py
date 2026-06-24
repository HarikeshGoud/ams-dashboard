"""
One-time fix:
- Deactivate old employees (ids 1-28, no employee_code)
- Reassign any tasks/visits/attendance pointing to old IDs → new IDs
"""
from app.database import SessionLocal
from app.models.employee import Employee
from app.models.task import Task
from app.models.visit import Visit
from app.models.attendance import Attendance
from app.models.salary import SalaryRecord
from app.models.travel import TravelTrip

db = SessionLocal()

# Build name → new employee map (those with codes)
new_emps = {e.name: e for e in db.query(Employee).filter(Employee.employee_code != None).all()}

# Get old employees (no code)
old_emps = db.query(Employee).filter(Employee.employee_code == None).all()

print(f"Old employees to deactivate: {len(old_emps)}")
print(f"New employees with codes: {len(new_emps)}")

for old in old_emps:
    new = new_emps.get(old.name)
    if new:
        # Reassign tasks
        count = db.query(Task).filter(Task.assigned_to_id == old.id).count()
        if count:
            db.query(Task).filter(Task.assigned_to_id == old.id).update({"assigned_to_id": new.id})
            print(f"  Reassigned {count} task(s) from {old.name} id={old.id} -> id={new.id}")

        # Reassign visits
        db.query(Visit).filter(Visit.employee_id == old.id).update({"employee_id": new.id})

        # Reassign attendance
        db.query(Attendance).filter(Attendance.employee_id == old.id).update({"employee_id": new.id})

        # Reassign salary records
        try:
            db.query(SalaryRecord).filter(SalaryRecord.employee_id == old.id).update({"employee_id": new.id})
        except: pass

        # Reassign travel
        try:
            db.query(TravelTrip).filter(TravelTrip.employee_id == old.id).update({"employee_id": new.id})
        except: pass

    # Deactivate old
    old.is_active = False

db.commit()
print("Done. All old employees deactivated, references reassigned.")
db.close()
