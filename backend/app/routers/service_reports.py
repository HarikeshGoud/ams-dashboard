import os, base64, io
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel
from ..database import get_db
from ..models.service_report import ServiceReport
from ..models.school import School
from ..models.employee import Employee
from ..dependencies import get_current_user, require_admin_or_deskwork

router = APIRouter(prefix="/api/service-reports", tags=["service-reports"])

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")


class CreateServiceReport(BaseModel):
    field_report_id:     Optional[int]   = None
    task_id:             Optional[int]   = None
    school_id:           Optional[int]   = None
    problem_description: Optional[str]   = None
    observation:         Optional[str]   = None
    action_taken:        Optional[str]   = None
    spare_parts:         Optional[str]   = None
    tds_input:           Optional[float] = None
    tds_output:          Optional[float] = None
    voltage:             Optional[float] = None
    flow_rate:           Optional[float] = None
    technician_signature_b64: Optional[str] = None  # base64 PNG
    principal_signature_b64:  Optional[str] = None  # base64 PNG
    principal_name:      Optional[str]   = None


def _save_b64_image(b64_str: str, path: str):
    """Decode base64 data-URL or raw base64 and save as PNG."""
    if not b64_str:
        return
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]
    data = base64.b64decode(b64_str)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def _generate_pdf(report: ServiceReport, db: Session) -> str:
    """Generate PDF and return relative path (from uploads/)."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, HRFlowable
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
    except ImportError:
        return None

    rel_dir = f"service_reports/{report.report_date.year}/{report.report_date.month}"
    abs_dir = os.path.join(UPLOADS_DIR, rel_dir)
    os.makedirs(abs_dir, exist_ok=True)
    rel_path = f"{rel_dir}/report_{report.id}.pdf"
    abs_path = os.path.join(UPLOADS_DIR, rel_path)

    doc = SimpleDocTemplate(abs_path, pagesize=A4,
                            topMargin=15*mm, bottomMargin=15*mm,
                            leftMargin=15*mm, rightMargin=15*mm)

    styles = getSampleStyleSheet()
    W = A4[0] - 30*mm  # usable width

    title_style   = ParagraphStyle("title",   fontSize=16, fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=2)
    sub_style     = ParagraphStyle("sub",     fontSize=9,  fontName="Helvetica",      alignment=TA_CENTER, spaceAfter=8, textColor=colors.grey)
    label_style   = ParagraphStyle("label",   fontSize=8,  fontName="Helvetica-Bold", textColor=colors.grey)
    value_style   = ParagraphStyle("value",   fontSize=10, fontName="Helvetica")
    section_style = ParagraphStyle("section", fontSize=9,  fontName="Helvetica-Bold", textColor=colors.HexColor("#1e40af"), spaceBefore=8, spaceAfter=4)

    story = []

    # ── Header ──────────────────────────────────────────────────────────────
    school_name = report.school.name if report.school else "—"
    tech_name   = report.employee.name if report.employee else "—"

    story.append(Paragraph("SERVICE REPORT", title_style))
    story.append(Paragraph("Water Purifier Maintenance & Service", sub_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#1e40af")))
    story.append(Spacer(1, 4*mm))

    # ── Info table ──────────────────────────────────────────────────────────
    info_data = [
        [Paragraph("SCHOOL / CLIENT", label_style), Paragraph(school_name, value_style),
         Paragraph("DATE", label_style),            Paragraph(str(report.report_date), value_style)],
        [Paragraph("TECHNICIAN", label_style),      Paragraph(tech_name, value_style),
         Paragraph("PRINCIPAL / CONTACT", label_style), Paragraph(report.principal_name or "—", value_style)],
    ]
    info_table = Table(info_data, colWidths=[30*mm, 70*mm, 30*mm, 60*mm])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX",        (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("INNERGRID",  (0, 0), (-1, -1), 0.3, colors.HexColor("#e2e8f0")),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 3*mm))

    # ── Parts serviced ───────────────────────────────────────────────────────
    story.append(Paragraph("PARTS INSTALLED / SERVICED", section_style))
    parts_text = report.spare_parts or "—"
    story.append(Paragraph(parts_text, value_style))
    story.append(Spacer(1, 2*mm))

    # ── Work details ─────────────────────────────────────────────────────────
    def detail_row(label, text):
        return [Paragraph(label, label_style), Paragraph(text or "—", value_style)]

    work_data = [
        detail_row("PROBLEM DESCRIPTION", report.problem_description),
        detail_row("OBSERVATION",          report.observation),
        detail_row("ACTION TAKEN",         report.action_taken),
    ]
    work_table = Table(work_data, colWidths=[40*mm, W - 40*mm])
    work_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
        ("BOX",        (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("INNERGRID",  (0, 0), (-1, -1), 0.3, colors.HexColor("#e2e8f0")),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("VALIGN",     (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(work_table)
    story.append(Spacer(1, 3*mm))

    # ── Plant readings ────────────────────────────────────────────────────────
    story.append(Paragraph("PLANT READINGS", section_style))
    readings = [
        ["PARAMETER", "VALUE", "PARAMETER", "VALUE"],
        ["TDS Input (ppm)",  f"{report.tds_input:.0f}"  if report.tds_input  is not None else "—",
         "TDS Output (ppm)", f"{report.tds_output:.0f}" if report.tds_output is not None else "—"],
        ["Voltage (V)",      f"{report.voltage:.1f}"    if report.voltage    is not None else "—",
         "Flow Rate (LPH)",  f"{report.flow_rate:.1f}"  if report.flow_rate  is not None else "—"],
    ]
    readings_table = Table(readings, colWidths=[45*mm, 45*mm, 45*mm, 55*mm])
    readings_table.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (-1, 0),  colors.HexColor("#1e40af")),
        ("TEXTCOLOR",   (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",    (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",    (0, 0), (-1, 0),  8),
        ("BACKGROUND",  (0, 1), (0, -1),  colors.HexColor("#f1f5f9")),
        ("BACKGROUND",  (2, 1), (2, -1),  colors.HexColor("#f1f5f9")),
        ("BOX",         (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("INNERGRID",   (0, 0), (-1, -1), 0.3, colors.HexColor("#e2e8f0")),
        ("TOPPADDING",  (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0),(-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("ALIGN",       (0, 0), (-1, -1), "CENTER"),
    ]))
    story.append(readings_table)
    story.append(Spacer(1, 6*mm))

    # ── Signatures + Stamp ────────────────────────────────────────────────────
    col = W / 3

    def sig_image(path, max_w=55*mm, max_h=18*mm):
        if path and os.path.exists(os.path.join(UPLOADS_DIR, path)):
            try:
                img = RLImage(os.path.join(UPLOADS_DIR, path))
                img_w, img_h = img.imageWidth, img.imageHeight
                ratio = min(max_w / img_w, max_h / img_h)
                img.drawWidth  = img_w * ratio
                img.drawHeight = img_h * ratio
                return img
            except Exception:
                pass
        return Paragraph("(no signature)", ParagraphStyle("ns", fontSize=8, textColor=colors.grey))

    # School stamp
    stamp_path = None
    if report.school_id:
        for ext in ("png", "jpg", "jpeg"):
            candidate = os.path.join(UPLOADS_DIR, "stamps", f"{report.school_id}.{ext}")
            if os.path.exists(candidate):
                stamp_path = candidate
                break

    def stamp_cell():
        if stamp_path:
            try:
                img = RLImage(stamp_path)
                ratio = min((col - 10*mm) / img.imageWidth, 22*mm / img.imageHeight)
                img.drawWidth  = img.imageWidth  * ratio
                img.drawHeight = img.imageHeight * ratio
                return img
            except Exception:
                pass
        return Paragraph("(no stamp on file)", ParagraphStyle("ns", fontSize=8, textColor=colors.grey))

    sig_data = [
        [sig_image(report.technician_signature), sig_image(report.principal_signature), stamp_cell()],
        [Paragraph("Technician Signature", label_style),
         Paragraph("Principal / In-charge Signature", label_style),
         Paragraph("School Stamp", label_style)],
    ]
    sig_table = Table(sig_data, colWidths=[col, col, col])
    sig_table.setStyle(TableStyle([
        ("BOX",        (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("INNERGRID",  (0, 0), (-1, -1), 0.3, colors.HexColor("#e2e8f0")),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("ALIGN",      (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",     (0, 0), (-1, 0),  "MIDDLE"),
        ("BACKGROUND", (0, 1), (-1, 1),  colors.HexColor("#f8fafc")),
        ("ROWBACKGROUNDS", (0, 0), (-1, 0), [colors.white]),
    ]))
    story.append(sig_table)

    story.append(Spacer(1, 4*mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#e2e8f0")))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        f"Generated on {datetime.utcnow().strftime('%d %b %Y %H:%M')} UTC · AMS Water Purifier Management System",
        ParagraphStyle("footer", fontSize=7, textColor=colors.grey, alignment=TA_CENTER)
    ))

    doc.build(story)
    return rel_path


def _fmt(r: ServiceReport):
    return {
        "id": r.id,
        "field_report_id": r.field_report_id,
        "task_id": r.task_id,
        "employee_id": r.employee_id,
        "school_id": r.school_id,
        "school_name": r.school.name if r.school else None,
        "employee_name": r.employee.name if r.employee else None,
        "report_date": r.report_date.isoformat() if r.report_date else None,
        "problem_description": r.problem_description,
        "observation": r.observation,
        "action_taken": r.action_taken,
        "spare_parts": r.spare_parts,
        "tds_input": r.tds_input,
        "tds_output": r.tds_output,
        "voltage": r.voltage,
        "flow_rate": r.flow_rate,
        "principal_name": r.principal_name,
        "pdf_url": f"http://localhost:8000/uploads/{r.pdf_path}" if r.pdf_path else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.post("/")
def create_service_report(req: CreateServiceReport, db: Session = Depends(get_db), user=Depends(get_current_user)):
    today = date.today()
    sig_dir = os.path.join(UPLOADS_DIR, "signatures", str(today.year), str(today.month))
    os.makedirs(sig_dir, exist_ok=True)

    report = ServiceReport(
        field_report_id=req.field_report_id,
        task_id=req.task_id,
        employee_id=user.id,
        school_id=req.school_id,
        report_date=today,
        problem_description=req.problem_description,
        observation=req.observation,
        action_taken=req.action_taken,
        spare_parts=req.spare_parts,
        tds_input=req.tds_input,
        tds_output=req.tds_output,
        voltage=req.voltage,
        flow_rate=req.flow_rate,
        principal_name=req.principal_name,
    )
    db.add(report)
    db.flush()  # get id

    # Save signature images
    if req.technician_signature_b64:
        rel = f"signatures/{today.year}/{today.month}/tech_{report.id}.png"
        _save_b64_image(req.technician_signature_b64, os.path.join(UPLOADS_DIR, rel))
        report.technician_signature = rel

    if req.principal_signature_b64:
        rel = f"signatures/{today.year}/{today.month}/principal_{report.id}.png"
        _save_b64_image(req.principal_signature_b64, os.path.join(UPLOADS_DIR, rel))
        report.principal_signature = rel

    db.flush()

    # Generate PDF
    try:
        pdf_rel = _generate_pdf(report, db)
        if pdf_rel:
            report.pdf_path = pdf_rel
    except Exception as e:
        print(f"PDF generation failed: {e}")

    db.commit()
    db.refresh(report)
    return _fmt(report)


@router.get("/")
def list_reports(db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(ServiceReport)
    if user.role not in ("admin", "deskwork"):
        q = q.filter(ServiceReport.employee_id == user.id)
    reports = q.order_by(ServiceReport.created_at.desc()).limit(200).all()
    return [_fmt(r) for r in reports]


@router.get("/{report_id}/pdf")
def download_pdf(report_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    r = db.query(ServiceReport).filter(ServiceReport.id == report_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    if user.role not in ("admin", "deskwork") and r.employee_id != user.id:
        raise HTTPException(403, "Access denied")

    if not r.pdf_path:
        # Re-generate if missing
        pdf_rel = _generate_pdf(r, db)
        if pdf_rel:
            r.pdf_path = pdf_rel
            db.commit()

    if not r.pdf_path:
        raise HTTPException(500, "PDF generation failed — install reportlab on server")

    abs_path = os.path.join(UPLOADS_DIR, r.pdf_path)
    if not os.path.exists(abs_path):
        pdf_rel = _generate_pdf(r, db)
        if pdf_rel:
            r.pdf_path = pdf_rel
            db.commit()
            abs_path = os.path.join(UPLOADS_DIR, r.pdf_path)

    return FileResponse(abs_path, media_type="application/pdf",
                        filename=f"service_report_{r.id}_{r.report_date}.pdf")
