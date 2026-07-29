"""Data health checks.

Silent data gaps are what let the "site not linked" problem run for weeks: nothing
errored, screens looked fine, and the damage only surfaced when someone opened an
old PDF. This turns that invisible rot into numbers you can watch, and lets staff
repair the most common gap (a visit whose site was typed as free text instead of
picked from the site list) in a couple of clicks.
"""
import os, re, difflib
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from ..database import get_db
from ..models.service_report import ServiceReport
from ..models.field_report import FieldReport, WorkProof
from ..models.employee import Employee
from ..models.school import School
from ..models.task import Task
from ..models.mandal import Mandal
from ..dependencies import require_admin_or_deskwork
from ..storage import UPLOADS_DIR

router = APIRouter(prefix="/api/data-health", tags=["data-health"])


def _norm(s):
    s = (s or "").upper()
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _missing_file_count(rows, attr):
    """How many of these records point at a file that isn't on disk."""
    missing = 0
    for r in rows:
        rel = getattr(r, attr, None)
        if rel and not os.path.exists(os.path.join(UPLOADS_DIR, rel)):
            missing += 1
    return missing


@router.get("/")
def data_health(db: Session = Depends(get_db), user=Depends(require_admin_or_deskwork)):
    checks = []

    def add(key, label, count, detail, severity="warn", fixable=False):
        checks.append({
            "key": key, "label": label, "count": count, "detail": detail,
            "severity": "ok" if count == 0 else severity, "fixable": fixable,
        })

    # ── Site links ───────────────────────────────────────────────────────────
    sr_unlinked = db.query(ServiceReport).filter(ServiceReport.school_id.is_(None)).count()
    sr_total    = db.query(ServiceReport).count()
    add("reports_unlinked", "Service reports with no site linked", sr_unlinked,
        f"{sr_unlinked} of {sr_total}. These can't be filtered by Unit, Site Type or Mandal, "
        f"and their PDF shows no customer address or plant location.",
        fixable=True)

    fr_unlinked = db.query(FieldReport).filter(FieldReport.school_id.is_(None)).count()
    fr_total    = db.query(FieldReport).count()
    add("proofs_unlinked", "Proof reviews with no site linked", fr_unlinked,
        f"{fr_unlinked} of {fr_total}. Shown by name only — not tied to a site record.",
        fixable=True)

    tk_unlinked = db.query(Task).filter(Task.school_id.is_(None)).count()
    tk_total    = db.query(Task).count()
    add("tasks_unlinked", "Tasks with no site linked", tk_unlinked,
        f"{tk_unlinked} of {tk_total}. Any report created from these inherits the gap.",
        fixable=True)

    # ── Logins ───────────────────────────────────────────────────────────────
    no_login = db.query(Employee).filter(
        Employee.is_active == True,
        (Employee.employee_code.is_(None)) | (Employee.password_hash.is_(None))
    ).count()
    add("employees_no_login", "Active staff who cannot log in", no_login,
        "Missing an employee code or a password — they'd be unable to sign in.",
        severity="error")

    # ── Files on disk ────────────────────────────────────────────────────────
    reports = db.query(ServiceReport).filter(ServiceReport.pdf_path.isnot(None)).all()
    add("pdfs_missing", "Service report PDFs missing from storage",
        _missing_file_count(reports, "pdf_path"),
        "The record points at a PDF file that isn't there. These rebuild automatically "
        "when the reports list is opened.")

    sigs = db.query(ServiceReport).filter(
        (ServiceReport.technician_signature.isnot(None)) |
        (ServiceReport.principal_signature.isnot(None))
    ).all()
    missing_sigs = sum(
        1 for r in sigs
        if _missing_file_count([r], "technician_signature") or _missing_file_count([r], "principal_signature")
    )
    add("signatures_missing", "Reports whose signature image is gone", missing_sigs,
        "Signatures exist only as image files — if the file is gone it cannot be rebuilt.",
        severity="error")

    photos = db.query(WorkProof).all()
    add("photos_missing", "Proof photos missing from storage",
        _missing_file_count(photos, "file_path"),
        "The photo record exists but the image file is not on disk.", severity="error")

    # ── Assignment gaps ──────────────────────────────────────────────────────
    tech_no_mandal = db.query(Employee).filter(
        Employee.role == "technician", Employee.is_active == True,
        Employee.mandal_id.is_(None)
    ).count()
    add("techs_no_mandal", "Technicians with no mandal assigned", tech_no_mandal,
        "Daily task rotation can't pick sites for them.")

    sites_no_mandal = db.query(School).filter(
        School.is_active == True, School.mandal_id.is_(None)
    ).count()
    add("sites_no_mandal", "Sites with no mandal", sites_no_mandal,
        "These won't appear under any Mandal filter.")

    problems = sum(1 for c in checks if c["count"] > 0)
    return {
        "all_clear": problems == 0,
        "problem_count": problems,
        "checks": checks,
    }


# ── Fixing unlinked sites ────────────────────────────────────────────────────

@router.get("/unlinked-sites")
def unlinked_sites(limit: int = 200, db: Session = Depends(get_db),
                   user=Depends(require_admin_or_deskwork)):
    """Tasks whose site was typed as free text, with a best-guess suggestion so
    staff can confirm rather than search from scratch."""
    schools = db.query(School).filter(School.is_active == True).all()
    index = {}
    for s in schools:
        index.setdefault(_norm(s.name), []).append(s)
    keys = list(index.keys())

    tasks = (db.query(Task).filter(Task.school_id.is_(None))
             .order_by(Task.due_date.desc().nullslast(), Task.id.desc()).limit(limit).all())

    out = []
    for t in tasks:
        n = _norm(t.title)
        suggestion = None
        exact = index.get(n)
        if exact and len(exact) == 1:
            suggestion = {"id": exact[0].id, "name": exact[0].name, "confidence": 100}
        else:
            close = difflib.get_close_matches(n, keys, n=1, cutoff=0.80)
            if close:
                cand = index[close[0]][0]
                score = round(difflib.SequenceMatcher(None, n, close[0]).ratio() * 100)
                suggestion = {"id": cand.id, "name": cand.name, "confidence": score}

        sr = db.query(ServiceReport).filter(ServiceReport.task_id == t.id).count()
        fr = db.query(FieldReport).filter(FieldReport.task_id == t.id).count()
        emp = db.query(Employee).filter(Employee.id == t.assigned_to_id).first()
        out.append({
            "task_id": t.id,
            "title": t.title,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "technician": emp.name if emp else None,
            "service_reports": sr,
            "proof_reviews": fr,
            "suggestion": suggestion,
        })
    return {"count": len(out), "items": out}


class LinkSite(BaseModel):
    school_id: int

@router.patch("/unlinked-sites/{task_id}")
def link_site(task_id: int, data: LinkSite, db: Session = Depends(get_db),
              user=Depends(require_admin_or_deskwork)):
    """Attach a site to a task and carry it through to everything created from it."""
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(404, "Task not found")
    school = db.query(School).filter(School.id == data.school_id).first()
    if not school:
        raise HTTPException(404, "Site not found")

    t.school_id = school.id
    srs = db.query(ServiceReport).filter(ServiceReport.task_id == t.id,
                                        ServiceReport.school_id.is_(None)).all()
    frs = db.query(FieldReport).filter(FieldReport.task_id == t.id,
                                       FieldReport.school_id.is_(None)).all()
    for r in srs: r.school_id = school.id
    for r in frs: r.school_id = school.id

    # The PDF prints the site as customer name/address, so it has to be rebuilt.
    rebuilt = 0
    from .service_reports import _generate_pdf
    for r in srs:
        try:
            rel = _generate_pdf(r, db)
            if rel:
                r.pdf_path = rel
                rebuilt += 1
        except Exception as e:
            print(f"link_site: PDF rebuild failed for report {r.id}: {e}")

    db.commit()
    return {
        "ok": True, "task_id": t.id, "school": school.name,
        "service_reports_updated": len(srs),
        "proof_reviews_updated": len(frs),
        "pdfs_rebuilt": rebuilt,
    }
