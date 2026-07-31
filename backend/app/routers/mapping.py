"""Technician → Mandal → Site mapping.

Until now nothing in the API could WRITE any of this. School.technician_id,
School.technician_id_2 and the employee_mandals junction table were only ever read
back out — the original values were seeded straight into the database. So when a new
technician was hired there was no way to give them any territory, and they silently
received no auto-generated daily tasks forever: _technician_rotation_schools finds no
directly-assigned schools, falls back to their mandals, finds none of those either,
and returns an empty queue without complaining.

Two fields, deliberately kept in step by this router:

  Employee.mandals   (many-to-many)  drives daily task rotation and the dashboard.
  Employee.mandal_id (single, legacy) drives TRAVEL ALLOWANCE eligibility
                                      (_travel_enabled_for_employee reads it) and the
                                      mandal/state filters on the Travel page.

Writing only the many-to-many would look correct on the Tasks screen and quietly cost
the technician their travel allowance, so every mandal write here also sets mandal_id
to the designated primary mandal.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import or_, func
from pydantic import BaseModel
from typing import Optional, List

from ..database import get_db
from ..models.employee import Employee
from ..models.mandal import Mandal
from ..models.school import School
from ..dependencies import require_admin_or_deskwork

router = APIRouter(prefix="/api/mapping", tags=["mapping"])


def _site_counts_by_mandal(db: Session):
    """{mandal_id: total active top-level sites} — parents-with-children included,
    since they still belong to a mandal even though rotation skips them."""
    rows = (db.query(School.mandal_id, func.count(School.id))
              .filter(School.is_active == True, School.parent_school_id.is_(None))
              .group_by(School.mandal_id).all())
    return {mid: cnt for mid, cnt in rows if mid is not None}


@router.get("/overview")
def overview(db: Session = Depends(get_db), user=Depends(require_admin_or_deskwork)):
    """Every technician's coverage at a glance, so the gaps are impossible to miss."""
    techs = (db.query(Employee)
               .options(selectinload(Employee.mandals), joinedload(Employee.mandal))
               .filter(Employee.role == "technician", Employee.is_active == True)
               .order_by(Employee.employee_code).all())

    # One pass over sites instead of a query per technician (21 techs x 1300 sites).
    primary_counts, secondary_counts = {}, {}
    unassigned = 0
    total_sites = 0
    for tid, tid2 in db.query(School.technician_id, School.technician_id_2).filter(
            School.is_active == True, School.parent_school_id.is_(None)).all():
        total_sites += 1
        if tid:
            primary_counts[tid] = primary_counts.get(tid, 0) + 1
        else:
            unassigned += 1
        if tid2:
            secondary_counts[tid2] = secondary_counts.get(tid2, 0) + 1

    items = []
    for e in techs:
        mandals = sorted(e.mandals, key=lambda m: m.name)
        items.append({
            "id": e.id,
            "employee_code": e.employee_code,
            "name": e.name,
            "mandal_count": len(mandals),
            "mandals": [{"id": m.id, "name": m.name} for m in mandals],
            "primary_mandal_id": e.mandal_id,
            "primary_mandal_name": e.mandal.name if e.mandal else None,
            "site_count": primary_counts.get(e.id, 0),
            "shared_site_count": secondary_counts.get(e.id, 0),
            # The exact condition that makes auto task generation silently do nothing.
            # It must mirror every branch _technician_rotation_schools actually tries:
            # direct sites, then mandals[], then the LEGACY mandal_id. Leaving the
            # legacy field out overstated this — two technicians whose only mapping is
            # mandal_id do receive a queue through that last fallback.
            "no_coverage": (len(mandals) == 0 and e.mandal_id is None
                            and primary_counts.get(e.id, 0) == 0
                            and secondary_counts.get(e.id, 0) == 0),
            # Works today, but only through the legacy single-mandal fallback. Worth
            # showing so it can be mapped properly rather than left to rot.
            "legacy_mandal_only": (len(mandals) == 0 and e.mandal_id is not None
                                   and primary_counts.get(e.id, 0) == 0
                                   and secondary_counts.get(e.id, 0) == 0),
        })

    return {
        "technicians": items,
        "totals": {
            "technicians": len(items),
            "mandals": db.query(Mandal).count(),
            "sites": total_sites,
            "sites_unassigned": unassigned,
            "technicians_without_coverage": sum(1 for i in items if i["no_coverage"]),
            "technicians_legacy_mandal_only": sum(1 for i in items if i["legacy_mandal_only"]),
            "technicians_without_primary_mandal": sum(1 for i in items if not i["primary_mandal_id"]),
        },
    }


@router.get("/technician/{emp_id}")
def technician_detail(emp_id: int, db: Session = Depends(get_db),
                      user=Depends(require_admin_or_deskwork)):
    """A technician's mandals, each with a site breakdown for the drill-down."""
    emp = (db.query(Employee).options(selectinload(Employee.mandals))
             .filter(Employee.id == emp_id).first())
    if not emp:
        raise HTTPException(404, "Employee not found")
    if emp.role != "technician":
        raise HTTPException(400, "Only technicians hold site assignments.")

    assigned_ids = {m.id for m in emp.mandals}
    totals = _site_counts_by_mandal(db)

    # Per-mandal breakdown of who currently holds each site, for the mandals in scope.
    breakdown = {}
    if assigned_ids:
        for mid, tid, tid2 in db.query(School.mandal_id, School.technician_id, School.technician_id_2).filter(
                School.is_active == True, School.parent_school_id.is_(None),
                School.mandal_id.in_(assigned_ids)).all():
            b = breakdown.setdefault(mid, {"mine": 0, "others": 0, "unassigned": 0, "shared_with_me": 0})
            if tid == emp_id:
                b["mine"] += 1
            elif tid:
                b["others"] += 1
            else:
                b["unassigned"] += 1
            if tid2 == emp_id:
                b["shared_with_me"] += 1

    mandals = []
    for m in sorted(emp.mandals, key=lambda x: x.name):
        b = breakdown.get(m.id, {"mine": 0, "others": 0, "unassigned": 0, "shared_with_me": 0})
        mandals.append({
            "id": m.id, "name": m.name, "district": m.district, "state": m.state,
            "is_primary": m.id == emp.mandal_id,
            "site_total": totals.get(m.id, 0),
            **b,
        })

    return {
        "technician": {"id": emp.id, "employee_code": emp.employee_code, "name": emp.name},
        "primary_mandal_id": emp.mandal_id,
        "mandals": mandals,
        "all_mandals": [{"id": m.id, "name": m.name, "district": m.district, "state": m.state,
                         "site_total": totals.get(m.id, 0), "assigned": m.id in assigned_ids}
                        for m in db.query(Mandal).order_by(Mandal.name).all()],
    }


class MandalMapping(BaseModel):
    mandal_ids: List[int]
    primary_mandal_id: Optional[int] = None


@router.put("/technician/{emp_id}/mandals")
def set_technician_mandals(emp_id: int, data: MandalMapping, db: Session = Depends(get_db),
                           user=Depends(require_admin_or_deskwork)):
    """Replace a technician's mandal list, keeping the legacy primary in step."""
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(404, "Employee not found")
    if emp.role != "technician":
        raise HTTPException(400, "Only technicians hold mandal assignments.")

    wanted = list(dict.fromkeys(data.mandal_ids))  # de-dupe, keep order
    mandals = db.query(Mandal).filter(Mandal.id.in_(wanted)).all() if wanted else []
    if len(mandals) != len(wanted):
        missing = sorted(set(wanted) - {m.id for m in mandals})
        raise HTTPException(404, f"Unknown mandal id(s): {missing}")

    primary = data.primary_mandal_id
    if primary is not None and primary not in wanted:
        raise HTTPException(400, "The primary mandal must be one of the selected mandals.")
    # Travel eligibility reads mandal_id, so it can't be left dangling: default it to
    # the first selection, and clear it only when the technician has no mandals at all.
    if primary is None:
        primary = wanted[0] if wanted else None

    by_id = {m.id: m for m in mandals}
    emp.mandals = [by_id[mid] for mid in wanted]
    emp.mandal_id = primary
    db.commit()

    return {
        "ok": True,
        "technician": emp.name,
        "mandal_count": len(wanted),
        "primary_mandal_id": primary,
        "primary_mandal_name": by_id[primary].name if primary in by_id else None,
    }


@router.get("/mandal/{mandal_id}/sites")
def mandal_sites(mandal_id: int, technician_id: Optional[int] = None,
                 db: Session = Depends(get_db), user=Depends(require_admin_or_deskwork)):
    """Sites in a mandal with their current holders, for the site-level picker."""
    m = db.query(Mandal).filter(Mandal.id == mandal_id).first()
    if not m:
        raise HTTPException(404, "Mandal not found")

    sites = (db.query(School)
               .options(joinedload(School.technician), joinedload(School.technician_2))
               .filter(School.is_active == True, School.parent_school_id.is_(None),
                       School.mandal_id == mandal_id)
               .order_by(School.name).all())

    # A parent with sub-locations is a container: technicians report on each child, so
    # the assignment has to reach the children. Flag it so the UI can say so.
    child_counts = {}
    if sites:
        rows = (db.query(School.parent_school_id, func.count(School.id))
                  .filter(School.parent_school_id.in_([s.id for s in sites]),
                          School.is_active == True)
                  .group_by(School.parent_school_id).all())
        child_counts = {pid: cnt for pid, cnt in rows}

    def row(s):
        return {
            "id": s.id, "name": s.name, "model": s.model,
            "technician_id": s.technician_id,
            "technician_name": s.technician.name if s.technician else None,
            "technician_id_2": s.technician_id_2,
            "technician_2_name": s.technician_2.name if s.technician_2 else None,
            "sub_location_count": child_counts.get(s.id, 0),
            "last_visit_date": s.last_visit_date.isoformat() if s.last_visit_date else None,
            "held_by_me": technician_id is not None and s.technician_id == technician_id,
            "shared_with_me": technician_id is not None and s.technician_id_2 == technician_id,
        }

    return {"mandal": {"id": m.id, "name": m.name}, "count": len(sites),
            "items": [row(s) for s in sites]}


class SiteAssignment(BaseModel):
    technician_id: Optional[int] = None      # None only with action="clear"
    school_ids: List[int]
    slot: str = "primary"                    # primary -> technician_id, secondary -> technician_id_2
    action: str = "assign"                   # assign | clear
    overwrite: bool = False                  # assign over a site another technician already holds


@router.post("/assign-sites")
def assign_sites(data: SiteAssignment, db: Session = Depends(get_db),
                 user=Depends(require_admin_or_deskwork)):
    """Bulk assign or clear the technician on a set of sites.

    Reports skipped sites rather than silently overwriting someone else's territory —
    with 86 mandals and 1300 sites, a careless bulk assign is expensive to undo.
    """
    if data.slot not in ("primary", "secondary"):
        raise HTTPException(400, "slot must be 'primary' or 'secondary'")
    if data.action not in ("assign", "clear"):
        raise HTTPException(400, "action must be 'assign' or 'clear'")
    if not data.school_ids:
        raise HTTPException(400, "No sites selected.")

    tech = None
    if data.action == "assign":
        if not data.technician_id:
            raise HTTPException(400, "Select a technician to assign these sites to.")
        tech = db.query(Employee).filter(Employee.id == data.technician_id).first()
        if not tech:
            raise HTTPException(404, "Technician not found")
        if tech.role != "technician":
            raise HTTPException(400, "Sites can only be assigned to technicians.")
        if not tech.is_active:
            raise HTTPException(400, "That technician is inactive.")

    sites = db.query(School).filter(School.id.in_(data.school_ids),
                                    School.is_active == True).all()
    found = {s.id for s in sites}
    field = "technician_id" if data.slot == "primary" else "technician_id_2"

    changed, skipped, cascaded = 0, [], 0
    for s in sites:
        current = getattr(s, field)
        if data.action == "clear":
            if current is None:
                continue
            new_value = None
        else:
            if current == data.technician_id:
                continue                              # already correct, not a change
            if current and not data.overwrite:
                holder = db.query(Employee).filter(Employee.id == current).first()
                skipped.append({"id": s.id, "name": s.name,
                                "held_by": holder.name if holder else f"employee {current}"})
                continue
            # The same person in both slots would make a site look jointly covered by
            # one technician, and rotation would match it twice.
            other_field = "technician_id_2" if data.slot == "primary" else "technician_id"
            if getattr(s, other_field) == data.technician_id:
                setattr(s, other_field, None)
            new_value = data.technician_id

        setattr(s, field, new_value)
        changed += 1

        # Cascade to sub-locations: rotation skips parents that have children, so an
        # assignment that stopped at the parent would give the technician nothing.
        for child in db.query(School).filter(School.parent_school_id == s.id,
                                             School.is_active == True).all():
            if getattr(child, field) != new_value:
                setattr(child, field, new_value)
                cascaded += 1

    db.commit()

    return {
        "ok": True,
        "action": data.action,
        "slot": data.slot,
        "technician": tech.name if tech else None,
        "changed": changed,
        "cascaded_sub_locations": cascaded,
        "skipped": skipped,
        "not_found": sorted(set(data.school_ids) - found),
    }
