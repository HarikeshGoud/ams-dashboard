"""Technician → Mandal → Site mapping, and mandal administration.

Everything needed to keep this data straight lives here: which mandals a technician
covers, which mandal a site sits in, and creating / renaming / merging / deleting the
mandals themselves.

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

Exactly three columns point at mandals.id, and every destructive operation below has to
account for all three or it will either fail on a constraint or orphan data:

  schools.mandal_id           nullable  — which mandal a site sits in
  employees.mandal_id         nullable  — the legacy primary, drives travel allowance
  employee_mandals.mandal_id  NOT NULL, half of a composite primary key

That last one is why a merge cannot be a blind UPDATE: if a technician is linked to both
the source and the target mandal, repointing the row collides with the existing primary
key. It is done through the ORM collection instead, which de-duplicates.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import or_, func
from pydantic import BaseModel
from typing import Optional, List

from ..database import get_db
from ..models.employee import Employee
from ..models.employee_mandal import employee_mandals
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


# ── Site → mandal ────────────────────────────────────────────────────────────

@router.get("/sites")
def list_sites(search: Optional[str] = None, mandal_id: Optional[int] = None,
               unassigned_only: bool = False, limit: int = 3000,
               db: Session = Depends(get_db), user=Depends(require_admin_or_deskwork)):
    """Sites with the mandal they sit in, for repairing site → mandal placement.

    mandal_id=-1 is the explicit "no mandal" bucket: 0 and None both read as absent in a
    query string, so a sentinel is the only way to ask for it.

    The default limit clears the whole site table on purpose. A lower cap silently made
    "Select all" mean "select all of the ones that happened to load", so a bulk move would
    quietly act on a subset of what the operator was filtering for. The Schools page
    already pulls the full list this way, so the size is not new.

    limit is a plain int rather than a Query(...) so this stays callable straight from
    Python — a Query default reaches SQLAlchemy as the Query object itself and blows up
    with "int() argument must be ... not 'Query'".
    """
    limit = max(1, min(int(limit), 5000))
    q = (db.query(School)
           .options(joinedload(School.mandal), joinedload(School.technician))
           .filter(School.is_active == True, School.parent_school_id.is_(None)))
    if search and search.strip():
        q = q.filter(School.name.ilike(f"%{search.strip()}%"))
    if unassigned_only or mandal_id == -1:
        q = q.filter(School.mandal_id.is_(None))
    elif mandal_id:
        q = q.filter(School.mandal_id == mandal_id)

    total = q.count()
    sites = q.order_by(School.name).limit(limit).all()

    child_counts = {}
    if sites:
        rows = (db.query(School.parent_school_id, func.count(School.id))
                  .filter(School.parent_school_id.in_([s.id for s in sites]),
                          School.is_active == True)
                  .group_by(School.parent_school_id).all())
        child_counts = {pid: cnt for pid, cnt in rows}

    return {
        "total": total, "showing": len(sites), "truncated": total > len(sites),
        "items": [{
            "id": s.id, "name": s.name, "model": s.model,
            "mandal_id": s.mandal_id,
            "mandal_name": s.mandal.name if s.mandal else None,
            "technician_name": s.technician.name if s.technician else None,
            "sub_location_count": child_counts.get(s.id, 0),
        } for s in sites],
    }


class MandalAssignment(BaseModel):
    mandal_id: Optional[int] = None      # None clears the mandal
    school_ids: List[int]


@router.post("/assign-mandal")
def assign_mandal(data: MandalAssignment, db: Session = Depends(get_db),
                  user=Depends(require_admin_or_deskwork)):
    """Bulk move sites into a mandal (or clear it)."""
    if not data.school_ids:
        raise HTTPException(400, "No sites selected.")

    mandal = None
    if data.mandal_id is not None:
        mandal = db.query(Mandal).filter(Mandal.id == data.mandal_id).first()
        if not mandal:
            raise HTTPException(404, "Mandal not found")

    sites = db.query(School).filter(School.id.in_(data.school_ids),
                                    School.is_active == True).all()
    changed, cascaded = 0, 0
    for s in sites:
        if s.mandal_id == data.mandal_id:
            continue
        s.mandal_id = data.mandal_id
        changed += 1
        # Sub-locations live in the same place as their parent — the Mandal filters on
        # Service Reports read the site's own mandal, so children left behind would
        # silently drop out of those reports.
        for child in db.query(School).filter(School.parent_school_id == s.id,
                                             School.is_active == True).all():
            if child.mandal_id != data.mandal_id:
                child.mandal_id = data.mandal_id
                cascaded += 1
    db.commit()

    return {"ok": True, "mandal": mandal.name if mandal else None,
            "changed": changed, "cascaded_sub_locations": cascaded,
            "not_found": sorted(set(data.school_ids) - {s.id for s in sites})}


def _norm_name(name: str) -> str:
    """Case- and spacing-insensitive key for spotting the same name entered twice.

    Used for both mandals and sites — the duplicates in this data arose the same way in
    both: an upper-case entry and a Title-case one for the same real place.
    """
    return " ".join((name or "").strip().upper().split())


# ── Site administration: duplicates, rename, merge, delete ───────────────────

# Every column that points at schools.id. A merge has to move all of them and a delete has
# to refuse while any of them still does, or the work history is silently orphaned.
def _site_reference_counts(db: Session, school_id: int) -> dict:
    from ..models.task import Task
    from ..models.service_report import ServiceReport
    from ..models.field_report import FieldReport
    from ..models.visit import Visit
    from ..models.amc_report import AMCReport
    from ..models.complaint import Complaint
    return {
        "tasks":            db.query(Task).filter(Task.school_id == school_id).count(),
        "service_reports":  db.query(ServiceReport).filter(ServiceReport.school_id == school_id).count(),
        "proof_reviews":    db.query(FieldReport).filter(FieldReport.school_id == school_id).count(),
        "visits":           db.query(Visit).filter(Visit.school_id == school_id).count(),
        "amc_reports":      db.query(AMCReport).filter(AMCReport.school_id == school_id).count(),
        "complaints":       db.query(Complaint).filter(Complaint.school_id == school_id).count(),
        "sub_locations":    db.query(School).filter(School.parent_school_id == school_id).count(),
        "posted_technicians": db.query(Employee).filter(Employee.dedicated_school_id == school_id).count(),
    }


_REF_LABELS = {
    "tasks": "task", "service_reports": "service report", "proof_reviews": "proof review",
    "visits": "visit", "amc_reports": "AMC report", "complaints": "complaint",
    "sub_locations": "sub-location", "posted_technicians": "posted technician",
}


def _ref_phrases(counts: dict):
    out = []
    for key, n in counts.items():
        if n:
            out.append(f"{n} {_REF_LABELS[key]}{'s' if n != 1 else ''}")
    return out


@router.get("/site-duplicates")
def site_duplicates(db: Session = Depends(get_db), user=Depends(require_admin_or_deskwork)):
    """Active top-level sites sharing a name, with what each one actually holds.

    Creating the same site twice is easy — the search shows both and nothing objects — and
    the damage is quiet: half the history lands on one row and half on the other.
    """
    sites = (db.query(School)
               .options(joinedload(School.mandal))
               .filter(School.is_active == True, School.parent_school_id.is_(None))
               .order_by(School.name).all())

    groups = {}
    for s in sites:
        groups.setdefault(_norm_name(s.name), []).append(s)

    out = []
    for key, members in sorted(groups.items()):
        if len(members) < 2:
            continue
        rows = []
        for s in members:
            counts = _site_reference_counts(db, s.id)
            rows.append({
                "id": s.id, "name": s.name, "model": s.model,
                "mandal_name": s.mandal.name if s.mandal else None,
                "unit_number": s.unit_number,
                "last_visit_date": s.last_visit_date.isoformat() if s.last_visit_date else None,
                "counts": counts,
                "total_refs": sum(counts.values()),
                "blocked_by": _ref_phrases(counts),
                "deletable": sum(counts.values()) == 0,
            })
        # Suggest keeping whichever row carries the most history, so a merge moves the least.
        rows.sort(key=lambda r: -r["total_refs"])
        out.append({"name": key, "keep_id": rows[0]["id"], "sites": rows})

    return {"groups": out, "group_count": len(out)}


@router.get("/site/{school_id}/usage")
def site_usage(school_id: int, db: Session = Depends(get_db),
               user=Depends(require_admin_or_deskwork)):
    """What references a site — shown before offering to delete or merge it."""
    s = db.query(School).options(joinedload(School.mandal)).filter(School.id == school_id).first()
    if not s:
        raise HTTPException(404, "Site not found")
    counts = _site_reference_counts(db, school_id)
    return {
        "id": s.id, "name": s.name, "model": s.model, "is_active": s.is_active,
        "mandal_name": s.mandal.name if s.mandal else None,
        "parent_school_id": s.parent_school_id,
        "counts": counts, "total_refs": sum(counts.values()),
        "blocked_by": _ref_phrases(counts),
        "deletable": sum(counts.values()) == 0,
    }


class SiteEdit(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None          # school / hospital / temple / village / hostel / park / other
    unit_number: Optional[str] = None


SITE_TYPES = ("school", "hospital", "temple", "village", "hostel", "park", "other")


@router.patch("/site/{school_id}")
def edit_site(school_id: int, data: SiteEdit, db: Session = Depends(get_db),
              user=Depends(require_admin_or_deskwork)):
    """Rename a site or correct its type."""
    s = db.query(School).filter(School.id == school_id).first()
    if not s:
        raise HTTPException(404, "Site not found")

    if data.name is not None:
        new_name = data.name.strip()
        if not new_name:
            raise HTTPException(400, "Site name cannot be blank.")
        s.name = new_name
    if data.model is not None:
        m = data.model.strip().lower()
        if m not in SITE_TYPES:
            raise HTTPException(400, f"Site type must be one of: {', '.join(SITE_TYPES)}")
        # Changing to or from 'temple' changes whether a service report is required, and
        # 'school' is the only type daily rotation picks up — worth being explicit about.
        s.model = m
        # Sub-locations inherit their parent's type; leaving them behind would split a
        # campus across two types and break the temple report exemption for half of it.
        for child in db.query(School).filter(School.parent_school_id == s.id).all():
            child.model = m
    if data.unit_number is not None:
        s.unit_number = data.unit_number.strip() or None

    db.commit(); db.refresh(s)
    return {"ok": True, "id": s.id, "name": s.name, "model": s.model,
            "unit_number": s.unit_number}


@router.delete("/site/{school_id}")
def delete_site(school_id: int, archive: bool = False, db: Session = Depends(get_db),
                user=Depends(require_admin_or_deskwork)):
    """Remove a site.

    A site nothing references — the duplicate you just created by mistake — is deleted
    outright. One that carries history is refused, because deleting it would strip the site
    from real tasks and reports. Merge it into the row you're keeping instead, or pass
    archive=true to just hide it while leaving its history intact.
    """
    s = db.query(School).filter(School.id == school_id).first()
    if not s:
        raise HTTPException(404, "Site not found")

    counts = _site_reference_counts(db, school_id)
    total = sum(counts.values())

    if archive:
        s.is_active = False
        # A hidden parent with visible children would leave orphans in every site list.
        hidden_children = 0
        for child in db.query(School).filter(School.parent_school_id == s.id,
                                             School.is_active == True).all():
            child.is_active = False
            hidden_children += 1
        db.commit()
        return {"ok": True, "archived": s.name, "hidden_sub_locations": hidden_children,
                "kept_history": total}

    if total:
        raise HTTPException(400,
            f"'{s.name}' still has {', '.join(_ref_phrases(counts))} attached. Deleting it "
            f"would strip the site off that history. Merge it into the site you're keeping, "
            f"or archive it to hide it without losing anything.")

    name = s.name
    db.delete(s); db.commit()
    return {"ok": True, "deleted": name}


class SiteMerge(BaseModel):
    into_school_id: int


@router.post("/site/{school_id}/merge")
def merge_site(school_id: int, data: SiteMerge, db: Session = Depends(get_db),
               user=Depends(require_admin_or_deskwork)):
    """Move everything off a duplicate site onto the one being kept, then delete it.

    All eight columns that reference schools.id are repointed. Anything missed here would
    either block the delete on a constraint or, worse, leave a task or report pointing at a
    row that no longer exists.
    """
    from ..models.task import Task
    from ..models.service_report import ServiceReport
    from ..models.field_report import FieldReport
    from ..models.visit import Visit
    from ..models.amc_report import AMCReport
    from ..models.complaint import Complaint

    src = db.query(School).filter(School.id == school_id).first()
    if not src:
        raise HTTPException(404, "Site to merge was not found")
    if data.into_school_id == school_id:
        raise HTTPException(400, "Pick a different site to merge into.")
    dst = db.query(School).filter(School.id == data.into_school_id).first()
    if not dst:
        raise HTTPException(404, "Target site was not found")
    if dst.parent_school_id == src.id:
        raise HTTPException(400,
            f"'{dst.name}' is a sub-location of '{src.name}'. Merging a site into its own "
            f"child would leave the campus pointing at itself.")

    moved = {}
    for label, model, col in (
        ("tasks", Task, Task.school_id),
        ("service_reports", ServiceReport, ServiceReport.school_id),
        ("proof_reviews", FieldReport, FieldReport.school_id),
        ("visits", Visit, Visit.school_id),
        ("amc_reports", AMCReport, AMCReport.school_id),
        ("complaints", Complaint, Complaint.school_id),
    ):
        rows = db.query(model).filter(col == src.id).all()
        for r in rows:
            r.school_id = dst.id
        moved[label] = len(rows)

    # Sub-locations follow, and inherit the surviving parent's type so the campus stays
    # consistent (the temple report exemption reads each row's own model).
    kids = db.query(School).filter(School.parent_school_id == src.id).all()
    for k in kids:
        k.parent_school_id = dst.id
        k.model = dst.model
    moved["sub_locations"] = len(kids)

    posted = db.query(Employee).filter(Employee.dedicated_school_id == src.id).all()
    for e in posted:
        e.dedicated_school_id = dst.id
    moved["posted_technicians"] = len(posted)

    # Keep whichever visit date is later — the surviving row should reflect the most recent
    # real visit, whichever duplicate it was filed against.
    if src.last_visit_date and (not dst.last_visit_date or src.last_visit_date > dst.last_visit_date):
        dst.last_visit_date = src.last_visit_date
    # Fill blanks on the survivor from the row being removed rather than losing the detail.
    for field in ("mandal_id", "client_id", "unit_number", "capacity", "plant_model",
                  "address", "latitude", "longitude", "contact_person", "phone",
                  "technician_id", "technician_id_2"):
        if getattr(dst, field, None) in (None, "") and getattr(src, field, None) not in (None, ""):
            setattr(dst, field, getattr(src, field))

    db.flush()
    src_name = src.name
    db.delete(src)
    db.commit()

    return {"ok": True, "merged": src_name, "into": dst.name, "moved": moved,
            "total_moved": sum(moved.values())}


# ── Campus sub-locations and their visit frequency ───────────────────────────

@router.get("/campus/{school_id}")
def campus_detail(school_id: int, db: Session = Depends(get_db),
                  user=Depends(require_admin_or_deskwork)):
    """A campus's sub-locations, who is posted to it, and today's pool.

    A site like YADADRI TEMPLE is 22 named stops covered by a team. This is where the
    daily/weekly split per stop is set: everything is daily unless marked weekly, and a
    weekly stop returns to the pool 7 days after its last visit.
    """
    from .tasks import _is_due, WEEKLY_GAP_DAYS
    from ..ist_time import today_ist

    parent = db.query(School).filter(School.id == school_id).first()
    if not parent:
        raise HTTPException(404, "Site not found")

    kids = (db.query(School)
              .filter(School.parent_school_id == school_id, School.is_active == True)
              .order_by(School.name).all())
    today = today_ist()

    posted = (db.query(Employee)
                .filter(Employee.dedicated_school_id == school_id,
                        Employee.role == "technician", Employee.is_active == True)
                .order_by(Employee.employee_code).all())

    items = []
    for k in kids:
        weekly = (k.visit_frequency or "daily").lower() == "weekly"
        items.append({
            "id": k.id, "name": k.name,
            "visit_frequency": "weekly" if weekly else "daily",
            "last_visit_date": k.last_visit_date.isoformat() if k.last_visit_date else None,
            "due_today": _is_due(k, today),
            "days_since_visit": (today - k.last_visit_date).days if k.last_visit_date else None,
        })

    due = sum(1 for i in items if i["due_today"])
    return {
        "site": {"id": parent.id, "name": parent.name, "model": parent.model},
        "sub_location_count": len(items),
        "weekly_count": sum(1 for i in items if i["visit_frequency"] == "weekly"),
        "due_today": due,
        "weekly_gap_days": WEEKLY_GAP_DAYS,
        "posted_technicians": [
            {"id": e.id, "employee_code": e.employee_code, "name": e.name,
             "daily_task_target": e.daily_task_target,
             # What they'd actually be scored against today, target or derived.
             "effective_target": e.daily_task_target or max(1, -(-due // max(1, len(posted)))) }
            for e in posted
        ],
        "items": items,
    }


class VisitFrequency(BaseModel):
    school_ids: List[int]
    visit_frequency: str          # 'daily' | 'weekly'


@router.post("/visit-frequency")
def set_visit_frequency(data: VisitFrequency, db: Session = Depends(get_db),
                        user=Depends(require_admin_or_deskwork)):
    """Mark sub-locations as daily or weekly."""
    freq = (data.visit_frequency or "").strip().lower()
    if freq not in ("daily", "weekly"):
        raise HTTPException(400, "visit_frequency must be 'daily' or 'weekly'")
    if not data.school_ids:
        raise HTTPException(400, "No sub-locations selected.")

    sites = db.query(School).filter(School.id.in_(data.school_ids)).all()
    changed = 0
    for s in sites:
        # Stored as NULL for daily so the column stays empty for the ~1250 sites this
        # doesn't apply to, rather than writing 'daily' across the whole table.
        new = "weekly" if freq == "weekly" else None
        if s.visit_frequency != new:
            s.visit_frequency = new
            changed += 1
    db.commit()
    return {"ok": True, "visit_frequency": freq, "changed": changed,
            "not_found": sorted(set(data.school_ids) - {s.id for s in sites})}


# ── Mandal administration ────────────────────────────────────────────────────

def _staff_phrase(total: int, inactive: int, noun: str) -> str:
    """e.g. '3 inactive employees' / '2 employees (1 inactive)' / '1 employee'."""
    if inactive == total:
        return f"{total} inactive {noun}{'s' if total != 1 else ''}"
    if inactive:
        return f"{total} {noun}{'s' if total != 1 else ''} ({inactive} inactive)"
    return f"{total} {noun}{'s' if total != 1 else ''}"


def _blockers(sites: int, links: int, links_inactive: int,
              legacy: int, legacy_inactive: int):
    """Why a mandal can't be deleted, in words a non-technical user can act on."""
    out = []
    if sites:
        out.append(f"{sites} site{'s' if sites != 1 else ''} still in it")
    if links:
        out.append(_staff_phrase(links, links_inactive, "employee") + " assigned to it")
    if legacy:
        out.append(_staff_phrase(legacy, legacy_inactive, "employee") + " using it as their primary mandal")
    return out


@router.get("/mandals")
def list_mandals_admin(db: Session = Depends(get_db), user=Depends(require_admin_or_deskwork)):
    """Every mandal with its usage counts, and duplicate names grouped together.

    Duplicates are grouped case-insensitively because that is exactly how they arose:
    an early Title-case seeding round ("Choutuppal") was later superseded by an
    upper-case one ("CHOUTUPPAL") without the originals being removed.
    """
    mandals = db.query(Mandal).order_by(Mandal.name).all()
    site_counts = _site_counts_by_mandal(db)

    # Two different populations, and the difference matters.
    #
    # link_counts / legacy_counts cover ACTIVE TECHNICIANS — the operational picture, what
    # gets displayed. all_refs covers EVERY employee row, active or not, technician or not,
    # because that is the population delete_mandal refuses on and merge_mandal repoints.
    # Reporting only the active-technician figure made "safe to delete" lie about mandals
    # referenced solely by an inactive employee, and made the merge confirmation understate
    # what it was about to change.
    link_counts, legacy_counts = {}, {}
    for emp in (db.query(Employee).options(selectinload(Employee.mandals))
                  .filter(Employee.role == "technician", Employee.is_active == True).all()):
        for m in emp.mandals:
            link_counts[m.id] = link_counts.get(m.id, 0) + 1
        if emp.mandal_id:
            legacy_counts[emp.mandal_id] = legacy_counts.get(emp.mandal_id, 0) + 1

    # Split by active flag. "3 inactive staff" is a completely different decision from
    # "3 active staff", and the row has to be able to say which — a blocked Delete button
    # with no visible reason is useless.
    all_legacy_refs, legacy_inactive = {}, {}
    for mid, is_active in db.query(Employee.mandal_id, Employee.is_active).filter(
            Employee.mandal_id.isnot(None)).all():
        all_legacy_refs[mid] = all_legacy_refs.get(mid, 0) + 1
        if not is_active:
            legacy_inactive[mid] = legacy_inactive.get(mid, 0) + 1

    all_link_refs, link_inactive = {}, {}
    for mid, is_active in (db.query(employee_mandals.c.mandal_id, Employee.is_active)
                             .join(Employee, Employee.id == employee_mandals.c.employee_id).all()):
        all_link_refs[mid] = all_link_refs.get(mid, 0) + 1
        if not is_active:
            link_inactive[mid] = link_inactive.get(mid, 0) + 1
    # Sites too: delete_mandal counts only active ones, but an inactive site still carries
    # the FK, so a merge has to move it. Count both.
    all_site_refs = {}
    for (mid,) in db.query(School.mandal_id).filter(School.mandal_id.isnot(None)).all():
        all_site_refs[mid] = all_site_refs.get(mid, 0) + 1

    groups = {}
    for m in mandals:
        groups.setdefault(_norm_name(m.name), []).append(m.id)

    items = []
    for m in mandals:
        key = _norm_name(m.name)
        sites = site_counts.get(m.id, 0)
        links = link_counts.get(m.id, 0)
        legacy = legacy_counts.get(m.id, 0)
        items.append({
            "id": m.id, "name": m.name, "district": m.district,
            "state": m.state or "Telangana",
            "travel_eligible": True if m.travel_eligible is None else bool(m.travel_eligible),
            # Operational view: active technicians and active top-level sites.
            "site_count": sites,
            "technician_count": links,
            "legacy_primary_count": legacy,
            # Everything that actually references this row, whatever its active flag or
            # role. This is what a merge moves and what a delete refuses on, so it is what
            # the confirmation dialogs must quote.
            "total_site_refs": all_site_refs.get(m.id, 0),
            "total_technician_link_refs": all_link_refs.get(m.id, 0),
            "total_legacy_refs": all_legacy_refs.get(m.id, 0),
            "inactive_link_refs": link_inactive.get(m.id, 0),
            "inactive_legacy_refs": legacy_inactive.get(m.id, 0),
            "duplicate_of": [i for i in groups[key] if i != m.id],
            # Must mirror delete_mandal exactly, or the button offers a delete that 400s.
            "deletable": (all_site_refs.get(m.id, 0) == 0
                          and all_link_refs.get(m.id, 0) == 0
                          and all_legacy_refs.get(m.id, 0) == 0),
            # Deletable once the staff references are detached. Only sites make a mandal
            # truly undeletable, because dropping them would strip their mandal and quietly
            # remove them from every Mandal filter — merge, or move them, instead.
            "force_deletable": all_site_refs.get(m.id, 0) == 0,
            # Plain-English reasons, so the row can say why the button is off.
            "blocked_by": _blockers(all_site_refs.get(m.id, 0),
                                    all_link_refs.get(m.id, 0), link_inactive.get(m.id, 0),
                                    all_legacy_refs.get(m.id, 0), legacy_inactive.get(m.id, 0)),
        })

    dupe_groups = [
        {"name": k, "mandal_ids": v} for k, v in sorted(groups.items()) if len(v) > 1
    ]
    return {
        "items": items,
        "duplicate_groups": dupe_groups,
        "totals": {
            "mandals": len(items),
            "duplicate_groups": len(dupe_groups),
            "empty": sum(1 for i in items if i["site_count"] == 0),
            "deletable": sum(1 for i in items if i["deletable"]),
            # Holds no sites, so it can go once its staff references are detached. This is
            # the number that actually corresponds to an enabled Delete button.
            "removable": sum(1 for i in items if i["force_deletable"]),
        },
    }


class MandalCreate(BaseModel):
    name: str
    district: Optional[str] = "Nalgonda"
    state: Optional[str] = "Telangana"


@router.post("/mandals")
def create_mandal(data: MandalCreate, db: Session = Depends(get_db),
                  user=Depends(require_admin_or_deskwork)):
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(400, "Enter a mandal name.")
    # Mandal.name is UNIQUE, so a near-duplicate would hit an opaque IntegrityError.
    # Check case-insensitively too, since that is how the existing duplicates happened.
    for m in db.query(Mandal).all():
        if _norm_name(m.name) == _norm_name(name):
            raise HTTPException(400, f"'{m.name}' already exists (id {m.id}) — "
                                     f"use that one instead of creating a near-duplicate.")
    m = Mandal(name=name, district=(data.district or "").strip() or None,
               state=(data.state or "").strip() or "Telangana", travel_eligible=True)
    db.add(m); db.commit(); db.refresh(m)
    return {"ok": True, "id": m.id, "name": m.name, "district": m.district, "state": m.state}


class MandalEdit(BaseModel):
    name: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None


@router.patch("/mandals/{mandal_id}")
def edit_mandal(mandal_id: int, data: MandalEdit, db: Session = Depends(get_db),
                user=Depends(require_admin_or_deskwork)):
    m = db.query(Mandal).filter(Mandal.id == mandal_id).first()
    if not m:
        raise HTTPException(404, "Mandal not found")
    if data.name is not None:
        new_name = data.name.strip()
        if not new_name:
            raise HTTPException(400, "Mandal name cannot be blank.")
        clash = next((o for o in db.query(Mandal).filter(Mandal.id != mandal_id).all()
                      if _norm_name(o.name) == _norm_name(new_name)), None)
        if clash:
            raise HTTPException(400, f"'{clash.name}' (id {clash.id}) already uses that name — "
                                     f"merge them instead of renaming.")
        m.name = new_name
    if data.district is not None:
        m.district = data.district.strip() or None
    if data.state is not None:
        m.state = data.state.strip() or m.state
    db.commit(); db.refresh(m)
    return {"ok": True, "id": m.id, "name": m.name, "district": m.district, "state": m.state}


@router.delete("/mandals/{mandal_id}")
def delete_mandal(mandal_id: int, force: bool = False, db: Session = Depends(get_db),
                  user=Depends(require_admin_or_deskwork)):
    """Delete a mandal.

    Plain delete only succeeds when nothing at all references it. force=True additionally
    detaches STAFF references (an employee's primary mandal, and their mandal assignments)
    and then deletes — that is safe, because an employee with no primary mandal simply has
    no mandal-based travel rule and falls back to their explicit mandal list.

    Sites are never dropped this way, even with force. Clearing a site's mandal removes it
    from every Mandal filter and from the rotation's mandal fallback, silently. Moving them
    is what merge and the Sites tab are for.
    """
    m = db.query(Mandal).filter(Mandal.id == mandal_id).first()
    if not m:
        raise HTTPException(404, "Mandal not found")

    # Every count here ignores is_active: an archived site or a deactivated employee still
    # carries the foreign key, and Postgres rejects the delete regardless of whether the app
    # considers the row live. Counting only active rows would pass this check and then fail
    # on the constraint.
    sites = db.query(School).filter(School.mandal_id == mandal_id).count()
    legacy_emps = db.query(Employee).filter(Employee.mandal_id == mandal_id).all()
    link_rows = db.query(employee_mandals).filter(employee_mandals.c.mandal_id == mandal_id).count()

    if sites:
        raise HTTPException(400,
            f"'{m.name}' still has {sites} site(s) in it (archived sites count too — they "
            f"hold the same reference). Merge it into another mandal, or move the sites in "
            f"the Sites tab first. Deleting it here would leave them with no mandal, which "
            f"drops them out of every Mandal filter.")

    if (legacy_emps or link_rows) and not force:
        inactive = sum(1 for e in legacy_emps if not e.is_active)
        bits = _blockers(0, link_rows, 0, len(legacy_emps), inactive)
        raise HTTPException(400,
            f"'{m.name}' is still referenced by {', '.join(bits)}. "
            f"Deleting will detach them — confirm to go ahead.")

    detached_primary = 0
    for emp in legacy_emps:
        emp.mandal_id = None
        detached_primary += 1

    detached_links = 0
    if link_rows:
        # Through the ORM collection so SQLAlchemy's identity map stays consistent with the
        # junction table — a raw DELETE would leave stale collections cached on loaded rows.
        for emp in list(m.technicians):
            emp.mandals = [x for x in emp.mandals if x.id != m.id]
            detached_links += 1

    db.flush()
    name = m.name
    db.delete(m); db.commit()
    return {"ok": True, "deleted": name,
            "detached_primary_mandal": detached_primary,
            "detached_mandal_links": detached_links}


class MandalMerge(BaseModel):
    into_mandal_id: int


@router.post("/mandals/{mandal_id}/merge")
def merge_mandal(mandal_id: int, data: MandalMerge, db: Session = Depends(get_db),
                 user=Depends(require_admin_or_deskwork)):
    """Move everything from one mandal into another, then delete the empty one.

    Used to collapse the case-variant duplicates. Every one of the three columns that
    reference mandals.id is handled; the junction table goes through the ORM collection
    so a technician already linked to both mandals doesn't collide on the composite key.
    """
    src = db.query(Mandal).filter(Mandal.id == mandal_id).first()
    if not src:
        raise HTTPException(404, "Mandal to merge was not found")
    if data.into_mandal_id == mandal_id:
        raise HTTPException(400, "Pick a different mandal to merge into.")
    dst = db.query(Mandal).filter(Mandal.id == data.into_mandal_id).first()
    if not dst:
        raise HTTPException(404, "Target mandal was not found")

    # 1. Sites — including inactive ones, so a later reactivation doesn't dangle.
    sites = db.query(School).filter(School.mandal_id == src.id).all()
    for s in sites:
        s.mandal_id = dst.id

    # 2. Junction rows, via the collection so duplicates collapse instead of colliding.
    moved_links, already_had = 0, 0
    for emp in list(src.technicians):
        ids = {m.id for m in emp.mandals}
        emp.mandals = [m for m in emp.mandals if m.id != src.id]
        if dst.id in ids:
            already_had += 1
        else:
            emp.mandals = emp.mandals + [dst]
            moved_links += 1

    # 3. Legacy primary — leaving this pointing at a deleted row would break travel.
    legacy = db.query(Employee).filter(Employee.mandal_id == src.id).all()
    for emp in legacy:
        emp.mandal_id = dst.id

    db.flush()
    src_name = src.name
    db.delete(src)
    db.commit()

    return {
        "ok": True,
        "merged": src_name, "into": dst.name,
        "sites_moved": len(sites),
        "technician_links_moved": moved_links,
        "technician_links_already_present": already_had,
        "legacy_primaries_repointed": len(legacy),
    }
