from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from ..database import get_db
from ..models.task import Task
from ..models.employee import Employee
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

DAILY_DEFAULT = 5
DAILY_MAX     = 7

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_to_id: int
    school_id: Optional[int] = None
    priority: str = "medium"
    due_date: Optional[str] = None

def _fmt(t: Task):
    school_name = None
    if t.school_id and hasattr(t, 'school') and t.school:
        school_name = t.school.name
    return {
        "id": t.id, "title": t.title, "description": t.description,
        "assigned_to_id": t.assigned_to_id,
        "assigned_to_name": t.assigned_to.name if t.assigned_to else None,
        "school_id": t.school_id,
        "school_name": school_name,
        "priority": t.priority, "status": t.status,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }

def _count_today_tasks(db: Session, employee_id: int, task_date: date) -> int:
    return db.query(Task).filter(
        Task.assigned_to_id == employee_id,
        Task.due_date == task_date,
        Task.status != "cancelled"
    ).count()

@router.get("/my-tasks")
def my_tasks(db: Session = Depends(get_db), user=Depends(get_current_user)):
    tasks = db.query(Task).filter(
        Task.assigned_to_id == user.id,
        Task.status.in_(["pending", "in_progress"])
    ).order_by(Task.due_date).all()
    return [_fmt(t) for t in tasks]

@router.get("/my-tasks/all")
def my_tasks_all(db: Session = Depends(get_db), user=Depends(get_current_user)):
    tasks = db.query(Task).filter(
        Task.assigned_to_id == user.id
    ).order_by(Task.due_date.desc()).all()
    return [_fmt(t) for t in tasks]

@router.get("/daily-count")
def daily_task_count(employee_id: int, task_date: str = None, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Return today's task count for an employee (used for cap validation UI)."""
    d = date.fromisoformat(task_date) if task_date else date.today()
    count = _count_today_tasks(db, employee_id, d)
    return {"count": count, "default_limit": DAILY_DEFAULT, "max_limit": DAILY_MAX, "can_add": count < DAILY_MAX}

def _rotation_eligible_schools(db, mandal_id: int, exclude_school_ids: set = None):
    """
    Rotation rule: a school that has been visited CANNOT be revisited until
    every other school in the same mandal has been visited at least once.

    Returns (eligible_schools, all_mandal_schools, new_round).
    - new_round=True means all schools have been visited; ordering is by
      last_visit_date ASC (least-recently-visited first).
    - new_round=False means some schools are still unvisited this round;
      only those unvisited schools are eligible.
    """
    from ..models.school import School
    all_schools = db.query(School).filter(
        School.mandal_id == mandal_id,
        School.is_active == True
    ).all()
    if not all_schools:
        return [], [], True

    exclude_ids = exclude_school_ids or set()
    unvisited = [s for s in all_schools if s.last_visit_date is None]
    new_round = len(unvisited) == 0  # all schools have been visited at least once

    if new_round:
        # All visited — new round starts; order by last_visit_date ASC
        eligible = sorted(all_schools, key=lambda s: s.last_visit_date)
    else:
        # Still unvisited schools remain — only they are eligible
        eligible = sorted(unvisited, key=lambda s: s.name)

    eligible = [s for s in eligible if s.id not in exclude_ids]
    return eligible, all_schools, new_round


@router.get("/suggested-schools")
def suggested_schools(employee_id: int, task_date: str = None, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Return next schools to visit for an employee based on mandal rotation."""
    from ..models.school import School
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp or not emp.mandal_id:
        return []
    d = date.fromisoformat(task_date) if task_date else date.today()

    already_assigned_today = {
        t.school_id for t in db.query(Task).filter(
            Task.assigned_to_id == employee_id,
            Task.due_date == d,
            Task.status != "cancelled"
        ).all() if t.school_id
    }

    eligible, all_schools, new_round = _rotation_eligible_schools(
        db, emp.mandal_id, exclude_school_ids=already_assigned_today
    )
    remaining_slots = max(0, DAILY_MAX - _count_today_tasks(db, employee_id, d))

    return {
        "new_round": new_round,
        "total_in_mandal": len(all_schools),
        "eligible_count": len(eligible),
        "schools": [{
            "id": s.id, "name": s.name,
            "last_visit_date": s.last_visit_date.isoformat() if s.last_visit_date else None,
        } for s in eligible[:remaining_slots]]
    }

@router.get("/")
def list_tasks(employee_id: int = None, task_date: str = None, db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = db.query(Task)
    if employee_id: q = q.filter(Task.assigned_to_id == employee_id)
    if task_date:
        d = date.fromisoformat(task_date)
        q = q.filter(Task.due_date == d)
    return [_fmt(t) for t in q.order_by(Task.due_date).all()]

@router.post("/")
def create_task(data: TaskCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    from ..models.school import School
    task_date = date.fromisoformat(data.due_date) if data.due_date else date.today()

    # ── Daily cap enforcement ──────────────────────────────────────────────────
    current_count = _count_today_tasks(db, data.assigned_to_id, task_date)
    if current_count >= DAILY_MAX:
        raise HTTPException(400,
            f"Daily limit reached: {DAILY_MAX} tasks max for {task_date}. "
            f"Cannot assign more tasks to this employee.")

    warning = None
    if current_count >= DAILY_DEFAULT:
        warning = f"Warning: task {current_count + 1}/{DAILY_MAX} — over the default limit of {DAILY_DEFAULT}."

    # ── School rotation enforcement ────────────────────────────────────────────
    if data.school_id:
        school = db.query(School).filter(School.id == data.school_id).first()
        if school and school.mandal_id:
            # Schools already assigned today for this employee (exclude from eligibility check)
            already_today = {
                t.school_id for t in db.query(Task).filter(
                    Task.assigned_to_id == data.assigned_to_id,
                    Task.due_date == task_date,
                    Task.status != "cancelled"
                ).all() if t.school_id
            }
            eligible, all_schools, new_round = _rotation_eligible_schools(
                db, school.mandal_id, exclude_school_ids=already_today
            )
            eligible_ids = {s.id for s in eligible}
            if data.school_id not in eligible_ids and len(all_schools) > 1:
                # Count how many unvisited schools remain in the mandal
                unvisited = [s for s in all_schools if s.last_visit_date is None]
                if not new_round:
                    unvisited_names = ", ".join(s.name for s in unvisited[:5])
                    raise HTTPException(400,
                        f"Rotation blocked: '{school.name}' was already visited. "
                        f"These {len(unvisited)} school(s) in the mandal must be visited first: "
                        f"{unvisited_names}{'...' if len(unvisited) > 5 else ''}.")

    t = Task(title=data.title, description=data.description,
             assigned_to_id=data.assigned_to_id, assigned_by_id=user.id,
             school_id=data.school_id, priority=data.priority,
             due_date=task_date)
    db.add(t); db.commit(); db.refresh(t)
    result = _fmt(t)
    result["warning"] = warning
    return result

@router.patch("/{tid}/status")
def update_status(tid: int, status: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    t = db.query(Task).filter(Task.id == tid).first()
    if not t: raise HTTPException(404, "Not found")
    t.status = status
    if status == "completed":
        t.completed_at = datetime.utcnow()
        # Stamp school.last_visit_date using the task's due_date (not necessarily today)
        if t.school_id:
            from ..models.school import School
            school = db.query(School).filter(School.id == t.school_id).first()
            if school:
                visit_date = t.due_date if t.due_date else datetime.utcnow().date()
                # Only advance — never roll back to an older date
                if not school.last_visit_date or visit_date >= school.last_visit_date:
                    school.last_visit_date = visit_date
    db.commit()
    return _fmt(t)

@router.delete("/{tid}")
def delete_task(tid: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    t = db.query(Task).filter(Task.id == tid).first()
    if not t: raise HTTPException(404, "Not found")

    task_title   = t.title
    assignee_id  = t.assigned_to_id
    task_due     = t.due_date

    db.delete(t); db.flush()

    # Deskwork employees notify all admins when they delete a task
    if user.role == "deskwork":
        from ..models.notification import Notification
        assignee = db.query(Employee).filter(Employee.id == assignee_id).first()
        admins   = db.query(Employee).filter(Employee.role == "admin", Employee.is_active == True).all()
        msg = (f"{user.name} deleted task '{task_title}' "
               f"assigned to {assignee.name if assignee else 'employee'} "
               f"on {task_due or 'N/A'}")
        for admin in admins:
            db.add(Notification(recipient_id=admin.id, sender_id=user.id, type="TASK_DELETED", message=msg))

    db.commit()
    return {"ok": True}

@router.post("/auto-attendance")
def auto_attendance(task_date: str = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Calculate and save attendance for all technicians based on task completion for the given date."""
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Not authorized")
    from ..models.attendance import Attendance
    d = date.fromisoformat(task_date) if task_date else date.today()
    technicians = db.query(Employee).filter(
        Employee.role.in_(["technician"]), Employee.is_active == True
    ).all()
    results = []
    for emp in technicians:
        tasks = db.query(Task).filter(Task.assigned_to_id == emp.id, Task.due_date == d).all()
        assigned  = len(tasks)
        completed = len([t for t in tasks if t.status == "completed"])
        if assigned == 0:
            continue
        if completed >= DAILY_DEFAULT:
            value, label, status = 1.0, "Full Day", "present"
        elif completed >= 3:
            value, label, status = 0.5, "Half Day", "half_day"
        else:
            value = round(completed / assigned, 2) if assigned > 0 else 0
            label = f"{completed}/{assigned}"
            status = "absent" if completed == 0 else "present"

        att = db.query(Attendance).filter(Attendance.employee_id == emp.id, Attendance.date == d).first()
        if att:
            att.status = status; att.tasks_assigned = assigned; att.tasks_completed = completed
            att.attendance_value = value; att.attendance_label = label
            att.notes = f"Auto: {label} ({completed}/{assigned} tasks)"
        else:
            db.add(Attendance(
                employee_id=emp.id, date=d, status=status,
                tasks_assigned=assigned, tasks_completed=completed,
                attendance_value=value, attendance_label=label,
                notes=f"Auto: {label} ({completed}/{assigned} tasks)"
            ))
        results.append({"employee": emp.name, "label": label, "value": value})
    db.commit()
    return {"date": str(d), "processed": len(results), "records": results}
