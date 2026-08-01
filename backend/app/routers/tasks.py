from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from ..database import get_db
from ..models.task import Task
from ..models.school import School
from ..models.employee import Employee
from ..dependencies import get_current_user
from ..ist_time import today_ist

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

# Eager-load relationships used by _fmt to avoid N+1 queries
def _with_relations(q):
    return q.options(
        joinedload(Task.school).joinedload(School.mandal),
        joinedload(Task.assigned_to),
    )

DAILY_DEFAULT = 5
DAILY_MAX     = 7


def _daily_target(emp) -> int:
    """How many tasks auto-generation should hand this technician for one day.

    A technician pinned to a single site services that one place daily, so generating the
    usual five would mean four duplicates of the same site every morning.
    """
    return 1 if getattr(emp, "dedicated_school_id", None) else DAILY_DEFAULT

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_to_id: int
    school_id: Optional[int] = None
    priority: str = "medium"
    due_date: Optional[str] = None

def _service_report_required(school) -> bool:
    """Whether a full service report must be filed for a visit to this site.

    Temples are exempt: the visit is a short daily clean rather than a plant service, so a
    full report with plant readings, spares and two signatures every single day is busywork
    that ends up filled with dummy values. Proof photos are still mandatory — the exemption
    is only the paperwork on top of them.
    """
    return not (school is not None and school.model == 'temple')


def _fmt(t: Task):
    school_name = None
    school_lat = None
    school_lng = None
    school_mandal = None
    school_address = None
    school_model = None
    if t.school_id and hasattr(t, 'school') and t.school:
        school_name    = t.school.name
        school_lat     = t.school.latitude
        school_lng     = t.school.longitude
        school_address = t.school.address
        school_model   = t.school.model
        if t.school.mandal:
            school_mandal = t.school.mandal.name
    return {
        "id": t.id, "title": t.title, "description": t.description,
        "assigned_to_id": t.assigned_to_id,
        "assigned_to_name": t.assigned_to.name if t.assigned_to else None,
        "school_id": t.school_id,
        "school_name": school_name,
        "school_lat": school_lat,
        "school_lng": school_lng,
        "school_mandal": school_mandal,
        "school_address": school_address,
        "school_model": school_model,
        # Drives whether the technician's proof flow locks them into Step 3.
        "service_report_required": _service_report_required(getattr(t, 'school', None)),
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
    tasks = _with_relations(db.query(Task)).filter(
        Task.assigned_to_id == user.id,
        Task.status.in_(["pending", "in_progress"])
    ).order_by(Task.due_date).all()
    return [_fmt(t) for t in tasks]

@router.get("/my-tasks/all")
def my_tasks_all(db: Session = Depends(get_db), user=Depends(get_current_user)):
    tasks = _with_relations(db.query(Task)).filter(
        Task.assigned_to_id == user.id
    ).order_by(Task.due_date.desc()).all()
    return [_fmt(t) for t in tasks]

@router.get("/daily-count")
def daily_task_count(employee_id: int, task_date: str = None, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Return today's task count for an employee (used for cap validation UI)."""
    d = date.fromisoformat(task_date) if task_date else today_ist()
    count = _count_today_tasks(db, employee_id, d)
    return {"count": count, "default_limit": DAILY_DEFAULT, "max_limit": DAILY_MAX, "can_add": count < DAILY_MAX}

def _technician_rotation_schools(db, employee_id: int, exclude_school_ids: set = None):
    """The auto-generation queue for one technician. AUTO-ASSIGNMENT ONLY.

    This decides what /generate-daily and the startup job hand out on their own,
    and what the UI offers as suggestions. It is NOT a permission check — manual
    assignment by deskwork/admin bypasses it entirely and always has a route to
    any site (see create_task).

    Scope: schools directly assigned to this technician (technician_id or the
    optional second technician). Fallback when none are assigned: schools in their
    mandals, via the employee_mandals junction table, then legacy mandal_id.

    Rule: a school becomes eligible only once every other school has been covered
    in this cycle. "Covered" means it has a last_visit_date (proof submitted) or an
    open pending/in_progress task for this technician — already spoken for, so
    don't hand it out twice. When all are covered, the cycle resets (new_round) and
    the least-recently-visited go first.

    One deliberate exception: a site whose plant_condition is 'not_working' jumps
    the queue regardless of cycle position, because a dead plant shouldn't wait for
    the rotation to come round to it.

    Only School.model == 'school' is ever auto-assigned. Hospitals, temples,
    villages, hostels, parks and 'other' are assigned by hand, as is any site that
    has sub-locations (technicians report on each sub-location, not on the parent
    container).

    Returns (eligible_schools, all_schools, new_round, visited_count).
    """
    from ..models.school import School

    # ── Dedicated single-site technician ──────────────────────────────────────
    # Someone who looks after one site (a temple, typically) every single day. Rotation is
    # meaningless here: the answer is always that one site, and it must stay eligible even
    # though it was visited yesterday, which is exactly what rotation would rule out.
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if emp and emp.dedicated_school_id:
        site = db.query(School).filter(School.id == emp.dedicated_school_id,
                                       School.is_active == True).first()
        if not site:
            return [], [], True, 0            # site was deleted or archived
        excluded = site.id in (exclude_school_ids or set())
        # new_round=True so callers treat the cycle as always complete — there is no queue
        # to work through and nothing is ever "still to be visited first".
        return ([] if excluded else [site]), [site], True, (1 if excluded else 0)

    # Primary: schools with technician_id (or the optional 2nd technician) pointing to this employee
    all_schools = db.query(School).filter(
        or_(School.technician_id == employee_id, School.technician_id_2 == employee_id),
        School.is_active == True
    ).all()

    # Fallback: schools in the employee's assigned mandals
    if not all_schools:
        emp = db.query(Employee).filter(Employee.id == employee_id).first()
        if emp and emp.mandals:
            mandal_ids = [m.id for m in emp.mandals]
            all_schools = db.query(School).filter(
                School.mandal_id.in_(mandal_ids),
                School.is_active == True
            ).all()
        elif emp and emp.mandal_id:
            all_schools = db.query(School).filter(
                School.mandal_id == emp.mandal_id,
                School.is_active == True
            ).all()

    if not all_schools:
        return [], [], True, 0

    # Automatic rotation/assignment only ever covers schools — hospitals, temples, and
    # every other site type are added manually by deskwork/admin as needed, not auto-assigned.
    all_schools = [s for s in all_schools if s.model == 'school']
    if not all_schools:
        return [], [], True, 0

    # A hospital with sub-locations is just an organizational container once it has children -
    # technicians visit and report on each sub-location individually, not the hospital itself.
    parents_with_children = {
        pid for (pid,) in db.query(School.parent_school_id)
            .filter(School.parent_school_id.isnot(None), School.is_active == True)
            .distinct().all()
    }
    all_schools = [s for s in all_schools if s.id not in parents_with_children]
    if not all_schools:
        return [], [], True, 0

    # Schools that have a pending or in_progress task for this technician count as
    # "in rotation this cycle" — they should not be re-assigned until the cycle resets.
    pending_school_ids = {
        t.school_id for t in db.query(Task).filter(
            Task.assigned_to_id == employee_id,
            Task.status.in_(["pending", "in_progress"]),
            Task.school_id.isnot(None)
        ).all()
    }

    exclude_ids = exclude_school_ids or set()

    # A school is unvisited this cycle if it has no last_visit_date AND no pending task
    unvisited = [s for s in all_schools if s.last_visit_date is None and s.id not in pending_school_ids]
    visited_count = len(all_schools) - len(unvisited)
    new_round = len(unvisited) == 0

    if new_round:
        # All schools visited — start fresh, prioritise least-recently visited
        rest = sorted(all_schools, key=lambda s: s.last_visit_date or date.min)
    else:
        rest = sorted(unvisited, key=lambda s: s.name)

    rest = [s for s in rest if s.id not in exclude_ids and s.id not in pending_school_ids]

    # Unresolved sites jump the queue regardless of rotation state — they need a
    # follow-up visit sooner than the normal cycle would otherwise reach them.
    unresolved = [s for s in all_schools
                  if s.plant_condition == 'not_working' and s.id not in exclude_ids and s.id not in pending_school_ids]
    unresolved_ids = {s.id for s in unresolved}

    eligible = unresolved + [s for s in rest if s.id not in unresolved_ids]
    return eligible, all_schools, new_round, visited_count


def _rotation_eligible_schools(db, mandal_id: int, exclude_school_ids: set = None):
    """Legacy per-mandal rotation. Still used when no technician_id on school."""
    from ..models.school import School
    all_schools = db.query(School).filter(
        School.mandal_id == mandal_id,
        School.is_active == True
    ).all()
    if not all_schools:
        return [], [], True

    exclude_ids = exclude_school_ids or set()
    unvisited = [s for s in all_schools if s.last_visit_date is None]
    new_round = len(unvisited) == 0

    if new_round:
        eligible = sorted(all_schools, key=lambda s: s.last_visit_date)
    else:
        eligible = sorted(unvisited, key=lambda s: s.name)

    eligible = [s for s in eligible if s.id not in exclude_ids]
    return eligible, all_schools, new_round


@router.get("/suggested-schools")
def suggested_schools(employee_id: int = None, task_date: str = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Return next schools to visit for a technician based on their personal rotation queue."""
    d = date.fromisoformat(task_date) if task_date else today_ist()
    employee_id = employee_id or user.id

    already_assigned_today = {
        t.school_id for t in db.query(Task).filter(
            Task.assigned_to_id == employee_id,
            Task.due_date == d,
            Task.status != "cancelled"
        ).all() if t.school_id
    }

    eligible, all_schools, new_round, visited_count = _technician_rotation_schools(
        db, employee_id, exclude_school_ids=already_assigned_today
    )
    remaining_slots = max(0, DAILY_MAX - _count_today_tasks(db, employee_id, d))

    return {
        "new_round": new_round,
        "total_schools": len(all_schools),
        "visited_count": visited_count,
        "unvisited_count": len(all_schools) - visited_count,
        "eligible_count": len(eligible),
        "schools": [{
            "id": s.id, "name": s.name,
            "mandal_name": s.mandal.name if s.mandal else None,
            "last_visit_date": s.last_visit_date.isoformat() if s.last_visit_date else None,
            "plant_condition": s.plant_condition,
        } for s in eligible[:remaining_slots]]
    }


@router.post("/generate-daily")
def generate_daily_tasks(task_date: str = None, employee_id: int = None,
                         db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Auto-generate 5 daily visit tasks per technician from their rotation queue."""
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Not authorized")

    d = date.fromisoformat(task_date) if task_date else today_ist()

    if employee_id:
        technicians = db.query(Employee).filter(
            Employee.id == employee_id, Employee.is_active == True
        ).all()
    else:
        technicians = db.query(Employee).filter(
            Employee.role == "technician", Employee.is_active == True
        ).all()

    results = []
    for emp in technicians:
        target = _daily_target(emp)
        existing_count = _count_today_tasks(db, emp.id, d)
        if existing_count >= target:
            results.append({
                "employee": emp.name, "employee_id": emp.id,
                "skipped": True, "reason": f"Already has {existing_count} tasks",
                "generated": 0, "total_tasks": existing_count
            })
            continue

        slots_needed = target - existing_count
        already_today = {
            t.school_id for t in db.query(Task).filter(
                Task.assigned_to_id == emp.id,
                Task.due_date == d,
                Task.status != "cancelled"
            ).all() if t.school_id
        }

        eligible, all_schools, new_round, visited_count = _technician_rotation_schools(
            db, emp.id, exclude_school_ids=already_today
        )

        generated = 0
        for school in eligible[:slots_needed]:
            db.add(Task(
                title=f"Visit {school.name}",
                description=f"Daily scheduled visit",
                assigned_to_id=emp.id,
                assigned_by_id=user.id,
                school_id=school.id,
                priority="medium",
                status="pending",
                due_date=d
            ))
            generated += 1

        db.commit()
        results.append({
            "employee": emp.name, "employee_id": emp.id,
            "skipped": False, "generated": generated,
            "total_tasks": existing_count + generated,
            "new_round": new_round,
            "total_schools": len(all_schools),
            "visited_count": visited_count
        })

    return {"date": str(d), "processed": len(results), "results": results}


@router.delete("/reset-all")
def reset_all_tasks(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Delete ALL tasks for all technicians. Admin only. Irreversible."""
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    from sqlalchemy import text
    # Count before delete so we can report it
    deleted = db.query(Task).count()
    # Null out task_id in every table that references tasks (PostgreSQL FK constraint)
    for tbl in ("field_reports", "work_proofs", "service_reports"):
        try:
            db.execute(text(f"UPDATE {tbl} SET task_id = NULL WHERE task_id IS NOT NULL"))
        except Exception:
            db.rollback()
    # Now delete all tasks
    db.execute(text("DELETE FROM tasks"))
    db.commit()
    return {"deleted": deleted, "message": f"All {deleted} tasks deleted. Ready for fresh generation."}


@router.get("/")
def list_tasks(employee_id: int = None, task_date: str = None, db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = _with_relations(db.query(Task))
    if employee_id: q = q.filter(Task.assigned_to_id == employee_id)
    if task_date:
        d = date.fromisoformat(task_date)
        q = q.filter(Task.due_date == d)
    return [_fmt(t) for t in q.order_by(Task.due_date).all()]

@router.post("/")
def create_task(data: TaskCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    from ..models.school import School
    task_date = date.fromisoformat(data.due_date) if data.due_date else today_ist()

    # ── Site is mandatory ─────────────────────────────────────────────────────
    # Without a school link the visit can't be traced: proof review shows
    # "Unknown School" and the service-report PDF has no customer name/address or
    # plant location. Typing the site into the Title is not enough — it must be
    # picked from the school list.
    if not data.school_id:
        raise HTTPException(400, "Select the school/site for this task — it cannot be left blank.")
    school = db.query(School).filter(School.id == data.school_id).first()
    if not school:
        raise HTTPException(404, "That school/site was not found.")

    # ── Daily cap enforcement ──────────────────────────────────────────────────
    current_count = _count_today_tasks(db, data.assigned_to_id, task_date)
    if current_count >= DAILY_MAX:
        raise HTTPException(400,
            f"Daily limit reached: {DAILY_MAX} tasks max for {task_date}. "
            f"Cannot assign more tasks to this employee.")

    warnings = []
    if current_count >= DAILY_DEFAULT:
        warnings.append(f"Task {current_count + 1}/{DAILY_MAX} — over the default limit of {DAILY_DEFAULT}.")

    # ── Rotation deliberately does NOT gate manual assignment ─────────────────
    # Rotation is a rule for AUTO-GENERATED daily tasks only — see
    # _technician_rotation_schools, used by /generate-daily and the startup job.
    # A hand-assigned visit is a decision someone made for a reason the rotation
    # can't see: a complaint came in, a plant is down, a customer rang. Making
    # those wait for the cycle to come round was the wrong trade.
    #
    # The old gate here also produced an error that contradicted itself. It
    # refused a school that merely had an open task, but worded the refusal as
    # "was already visited", and built the you-must-visit-these-first list from
    # last_visit_date alone. So a never-visited school got told it had been
    # visited, and was itself counted among the schools that had to be visited
    # first (printed too, whenever it fell in the truncated first five).
    # Removing the gate removes that message with it.
    #
    # A same-day duplicate is still worth surfacing, but as a note rather than a
    # refusal — two tasks for one site in a day is occasionally intended (a
    # morning visit and an afternoon repair), so the operator decides, not us.
    duplicate = db.query(Task).filter(
        Task.assigned_to_id == data.assigned_to_id,
        Task.school_id == data.school_id,
        Task.due_date == task_date,
        Task.status != "cancelled"
    ).first()
    if duplicate:
        warnings.append(
            f"This technician already has a task for {school.name} on {task_date} "
            f"(\"{duplicate.title}\"). Assigned anyway — delete one if it was a slip.")

    warning = " ".join(warnings) if warnings else None

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
    d = date.fromisoformat(task_date) if task_date else today_ist()
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
