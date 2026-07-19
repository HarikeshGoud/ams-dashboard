import os, base64, io
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import date, datetime, timezone, timedelta
from typing import Optional

IST = timezone(timedelta(hours=5, minutes=30))
def today_ist(): return datetime.now(IST).date()
from pydantic import BaseModel
from ..database import get_db
from ..models.service_report import ServiceReport
from ..models.school import School
from ..models.employee import Employee
from ..dependencies import get_current_user, require_admin_or_deskwork

router = APIRouter(prefix="/api/service-reports", tags=["service-reports"])

from ..storage import UPLOADS_DIR

COMPANY_NAME    = "SRI HAMSINI & CHANDRA ENTERPRISES"
COMPANY_ADDRESS = "Office Address: 2-1-49/244, Park Street, Street No. 17, Suryanagar Colony, Uppal, Hyderabad, Telangana - 500039"
COMPANY_EMAIL   = "E-mail Id: ch.srini1979@yahoo.com / ch.srini1979@rediffmail.com"
COMPANY_TEL     = "Tel No. 7670873623"


class CreateServiceReport(BaseModel):
    field_report_id:          Optional[int]   = None
    task_id:                  Optional[int]   = None
    school_id:                Optional[int]   = None
    report_no:                Optional[str]   = None
    complaint_no:             Optional[str]   = None
    unit_type:                Optional[str]   = "AMC"
    problem_description:      Optional[str]   = None
    observation:              Optional[str]   = None
    action_taken:             Optional[str]   = None
    spare_parts:              Optional[str]   = None
    plant_capacity:           Optional[str]   = None
    design_rw_tds:            Optional[str]   = None
    free_chlorine_rw:         Optional[str]   = None
    hours_running:            Optional[str]   = None
    membrane_condition:       Optional[str]   = "OK"
    uv_lamp_condition:        Optional[str]   = "OK"
    sensors_condition:        Optional[str]   = "OK"
    prefilter_condition:      Optional[str]   = "OK"
    tds_input:                Optional[float] = None   # Raw Water TDS
    tds_output:               Optional[float] = None   # Product Water TDS
    voltage:                  Optional[float] = None
    flow_rate:                Optional[float] = None   # Flow in LPH
    current_amps:             Optional[str]   = None
    customer_mobile:          Optional[str]   = None
    customer_remarks:         Optional[str]   = None
    status:                   Optional[str]   = "PROBLEM RESOLVED"
    technician_signature_b64: Optional[str]   = None
    principal_signature_b64:  Optional[str]   = None
    principal_name:           Optional[str]   = None


def _save_b64_image(b64_str: str, path: str):
    if not b64_str:
        return
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]
    data = base64.b64decode(b64_str)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def _generate_pdf(report: ServiceReport, db: Session) -> str:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import mm
        from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle,
                                        Paragraph, Spacer, Image as RLImage, HRFlowable)
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    except Exception:
        return None

    rel_dir  = f"service_reports/{report.report_date.year}/{report.report_date.month}"
    abs_dir  = os.path.join(UPLOADS_DIR, rel_dir)
    os.makedirs(abs_dir, exist_ok=True)
    rel_path = f"{rel_dir}/report_{report.id}.pdf"
    abs_path = os.path.join(UPLOADS_DIR, rel_path)

    BLUE   = colors.HexColor("#1565C0")
    LBLUE  = colors.HexColor("#E3F2FD")
    WHITE  = colors.white
    BLACK  = colors.black
    PINK   = colors.HexColor("#FFEBEE")
    RED    = colors.HexColor("#C62828")
    LGREY  = colors.HexColor("#F5F5F5")
    BORDER = colors.HexColor("#BDBDBD")

    PAGE_W = A4[0] - 20*mm
    LM = RM = 10*mm

    doc = SimpleDocTemplate(abs_path, pagesize=A4,
                            topMargin=8*mm, bottomMargin=8*mm,
                            leftMargin=LM, rightMargin=RM)

    def ps(name, size=9, bold=False, color=BLACK, align=TA_LEFT, leading=None):
        return ParagraphStyle(name, fontSize=size,
                              fontName="Helvetica-Bold" if bold else "Helvetica",
                              textColor=color, alignment=align,
                              leading=leading or size * 1.3)

    school_name  = report.school.name  if report.school  else "—"
    tech_name    = report.employee.name if report.employee else "—"

    def val(v, unit=""):
        if v is None or v == "" or v == "—":
            return "—"
        return f"{v}{unit}"

    def sig_img(path, w=55*mm, h=18*mm):
        if path:
            full = os.path.join(UPLOADS_DIR, path)
            if os.path.exists(full):
                try:
                    img = RLImage(full)
                    r = min(w / img.imageWidth, h / img.imageHeight)
                    img.drawWidth  = img.imageWidth  * r
                    img.drawHeight = img.imageHeight * r
                    return img
                except Exception:
                    pass
        return Paragraph("", ps("empty"))

    # ── Verification status — gates the stamp; serial_no is assigned separately ─
    field_report_verified = False
    if report.field_report_id:
        from ..models.field_report import FieldReport
        linked_fr = db.query(FieldReport).filter(FieldReport.id == report.field_report_id).first()
        if linked_fr and linked_fr.verification_status == "verified":
            field_report_verified = True

    # ── School stamp — only shown once the underlying proof has been verified ───
    stamp_img = None
    stamp_placeholder = "(no stamp on file)"
    if report.school_id:
        for ext in ("png", "jpg", "jpeg"):
            sp = os.path.join(UPLOADS_DIR, "stamps", f"{report.school_id}.{ext}")
            if os.path.exists(sp):
                stamp_placeholder = "(pending verification)"
                if field_report_verified:
                    try:
                        img = RLImage(sp)
                        r = min(30*mm / img.imageWidth, 15*mm / img.imageHeight)
                        img.drawWidth  = img.imageWidth  * r
                        img.drawHeight = img.imageHeight * r
                        stamp_img = img
                    except Exception:
                        pass
                break

    story = []

    # ══════════════════════════════════════════════════════════════════════════
    # 1. HEADER — blue background with company name
    # ══════════════════════════════════════════════════════════════════════════
    header_data = [[
        Paragraph(COMPANY_NAME, ps("h1", 14, bold=True, color=WHITE, align=TA_CENTER))
    ]]
    header_tbl = Table(header_data, colWidths=[PAGE_W])
    header_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), BLUE),
        ("TOPPADDING",    (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
    ]))
    story.append(header_tbl)

    addr_data = [[Paragraph(COMPANY_ADDRESS, ps("addr", 8, align=TA_CENTER))]]
    addr_tbl = Table(addr_data, colWidths=[PAGE_W])
    addr_tbl.setStyle(TableStyle([
        ("TOPPADDING",(0,0),(-1,-1),3), ("BOTTOMPADDING",(0,0),(-1,-1),3),
    ]))
    story.append(addr_tbl)

    title_data = [[Paragraph(
        "WATER PURIFICATION UNIT: INSTALLATION / COMMISSIONING / SERVICE / VISIT REPORT",
        ps("title", 9, bold=True, align=TA_CENTER)
    )]]
    title_tbl = Table(title_data, colWidths=[PAGE_W])
    title_tbl.setStyle(TableStyle([
        ("BOX",(0,0),(-1,-1),0.5,BORDER),
        ("TOPPADDING",(0,0),(-1,-1),4), ("BOTTOMPADDING",(0,0),(-1,-1),4),
    ]))
    story.append(title_tbl)

    # ══════════════════════════════════════════════════════════════════════════
    # 2. REPORT META ROW — Report No | Visit Date | Complaint No | Unit Type
    # ══════════════════════════════════════════════════════════════════════════
    serial_display = report.serial_no if report.serial_no else "PENDING VERIFICATION"
    serial_color = BLACK if report.serial_no else RED
    meta_data = [[
        Paragraph(f"<b>Serial No:</b> {serial_display}", ps("m",9,bold=True,color=serial_color)),
        Paragraph(f"<b>Report No:</b> {val(report.report_no)}", ps("m",9)),
        Paragraph(f"<b>Visit Date:</b> {report.report_date}", ps("m",9)),
        Paragraph(f"<b>Complaint No:</b> {val(report.complaint_no)}", ps("m",9)),
        Paragraph(f"<b>Unit Type: {val(report.unit_type)}</b>", ps("m",9,bold=True)),
    ]]
    meta_tbl = Table(meta_data, colWidths=[PAGE_W*0.20, PAGE_W*0.18, PAGE_W*0.20, PAGE_W*0.22, PAGE_W*0.20])
    meta_tbl.setStyle(TableStyle([
        ("BOX",(0,0),(-1,-1),0.5,BORDER), ("INNERGRID",(0,0),(-1,-1),0.5,BORDER),
        ("TOPPADDING",(0,0),(-1,-1),5), ("BOTTOMPADDING",(0,0),(-1,-1),5),
        ("LEFTPADDING",(0,0),(-1,-1),6),
    ]))
    story.append(meta_tbl)

    # ══════════════════════════════════════════════════════════════════════════
    # 3. CUSTOMER / PROBLEM / OBSERVATION block
    # ══════════════════════════════════════════════════════════════════════════
    obs_text = f"{val(report.observation)}"
    if report.action_taken:
        obs_text += f"\n{report.action_taken}"

    headers_row = [
        Paragraph("<b>CUSTOMER NAME &amp; ADDRESS:</b>", ps("ch",9,bold=True)),
        Paragraph("<b>PROBLEM REPORTED:</b>",             ps("ch",9,bold=True)),
        Paragraph("<b>OBSERVATION &amp; ACTION TAKEN:</b>", ps("ch",9,bold=True)),
    ]
    values_row = [
        Paragraph(school_name, ps("cv",9)),
        Paragraph(val(report.problem_description), ps("cv",9)),
        Paragraph(obs_text, ps("cv",9)),
    ]
    spares_row = [
        Paragraph("", ps("sp",9)),
        Paragraph(f"<b>SPARES REQUIRED:</b> {val(report.spare_parts)}", ps("sp",9)),
        Paragraph("", ps("sp",9)),
    ]
    cust_tbl = Table([headers_row, values_row, spares_row],
                     colWidths=[PAGE_W*0.28, PAGE_W*0.36, PAGE_W*0.36])
    cust_tbl.setStyle(TableStyle([
        ("BOX",(0,0),(-1,-1),0.5,BORDER), ("INNERGRID",(0,0),(-1,-1),0.5,BORDER),
        ("TOPPADDING",(0,0),(-1,-1),4), ("BOTTOMPADDING",(0,0),(-1,-1),4),
        ("LEFTPADDING",(0,0),(-1,-1),6),
        ("SPAN",(1,2),(2,2)),
        ("VALIGN",(0,0),(-1,-1),"TOP"),
    ]))
    story.append(cust_tbl)

    # ══════════════════════════════════════════════════════════════════════════
    # 4. UNIT DETAILS / PLANT READINGS — blue header, 2-column table
    # ══════════════════════════════════════════════════════════════════════════
    def lbl(t): return Paragraph(f"<b>{t}</b>", ps("lbl",9,bold=True))
    def v(t):   return Paragraph(str(t) if t else "—", ps("val",9))

    tds_in  = f"{report.tds_input:.0f}"  if report.tds_input  is not None else "—"
    tds_out = f"{report.tds_output:.0f}" if report.tds_output is not None else "—"
    volt    = f"{report.voltage:.1f}"    if report.voltage    is not None else "—"
    flow    = f"{report.flow_rate:.1f}"  if report.flow_rate  is not None else "—"

    sec_header = [[
        Paragraph("<b>UNIT DETAILS / SITE CONDITION</b>", ps("sh",9,bold=True,color=WHITE,align=TA_CENTER)),
        Paragraph("", ps("sh2",9)),
        Paragraph("<b>PLANT READINGS</b>", ps("ph",9,bold=True,color=WHITE,align=TA_CENTER)),
        Paragraph("", ps("ph2",9)),
    ]]
    detail_rows = [
        [lbl("Plant Location"),        v(school_name),                    lbl("Raw Water TDS"),              v(tds_in)],
        [lbl("Plant Capacity"),        v(report.plant_capacity),          lbl("Product Water TDS"),          v(tds_out)],
        [lbl("Design R/W TDS"),        v(report.design_rw_tds),           lbl("Product Water Flow in LPH"),  v(flow)],
        [lbl("Free Chlorine in R/W"),  v(report.free_chlorine_rw),        lbl("Sensors Condition"),          v(report.sensors_condition or "OK")],
        [lbl("No. of Hours Running"),  v(report.hours_running),           lbl("Pre-Filter Condition"),       v(report.prefilter_condition or "OK")],
        [lbl("Membrane Condition"),    v(report.membrane_condition or "OK"), lbl("Voltage"),                 v(volt)],
        [lbl("UV Lamp Condition"),     v(report.uv_lamp_condition or "OK"),  lbl("Current in Amps"),         v(report.current_amps)],
    ]
    col_w = [PAGE_W*0.22, PAGE_W*0.28, PAGE_W*0.28, PAGE_W*0.22]
    unit_tbl = Table(sec_header + detail_rows, colWidths=col_w)
    unit_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0),(1,0), BLUE),
        ("BACKGROUND", (2,0),(3,0), BLUE),
        ("TEXTCOLOR",  (0,0),(-1,0), WHITE),
        ("SPAN",       (0,0),(1,0)),
        ("SPAN",       (2,0),(3,0)),
        ("BOX",        (0,0),(-1,-1), 0.5, BORDER),
        ("INNERGRID",  (0,0),(-1,-1), 0.5, BORDER),
        ("BACKGROUND", (0,1),(0,-1), LGREY),
        ("BACKGROUND", (2,1),(2,-1), LGREY),
        ("TOPPADDING",    (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("LEFTPADDING",   (0,0),(-1,-1), 6),
        ("ALIGN",      (0,0),(-1,0), "CENTER"),
        ("VALIGN",     (0,0),(-1,-1), "MIDDLE"),
    ]))
    story.append(unit_tbl)

    # ══════════════════════════════════════════════════════════════════════════
    # 5. SPARES CONSUMED
    # ══════════════════════════════════════════════════════════════════════════
    spares_header = [[Paragraph("<b>SPARES CONSUMED</b>", ps("sc",9,bold=True,color=WHITE))]]
    spares_h_tbl = Table(spares_header, colWidths=[PAGE_W])
    spares_h_tbl.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1), BLUE),
        ("TOPPADDING",(0,0),(-1,-1),4), ("BOTTOMPADDING",(0,0),(-1,-1),4),
        ("LEFTPADDING",(0,0),(-1,-1),6),
        ("BOX",(0,0),(-1,-1),0.5,BORDER),
    ]))
    story.append(spares_h_tbl)

    spares_body = [[Paragraph(val(report.spare_parts), ps("sb",9))]]
    spares_b_tbl = Table(spares_body, colWidths=[PAGE_W])
    spares_b_tbl.setStyle(TableStyle([
        ("BOX",(0,0),(-1,-1),0.5,BORDER),
        ("TOPPADDING",(0,0),(-1,-1),6), ("BOTTOMPADDING",(0,0),(-1,-1),6),
        ("LEFTPADDING",(0,0),(-1,-1),6),
    ]))
    story.append(spares_b_tbl)

    # ══════════════════════════════════════════════════════════════════════════
    # 6. CUSTOMER NAME / SIGNATURE + STAMP
    # ══════════════════════════════════════════════════════════════════════════
    cust_lbl_row = [
        Paragraph("<b>CUSTOMER NAME / MOBILE NUMBER</b>", ps("cl",9,bold=True)),
        Paragraph("<b>CUSTOMER SIGNATURE &amp; DATE</b>", ps("cl",9,bold=True)),
        Paragraph("<b>SCHOOL STAMP</b>", ps("cl",9,bold=True)),
    ]
    cust_val_row = [
        Paragraph(f"{val(report.principal_name)}\n{val(report.customer_mobile)}", ps("cv2",9)),
        sig_img(report.principal_signature, 55*mm, 20*mm),
        stamp_img if stamp_img else Paragraph(stamp_placeholder, ps("ns",8,color=BORDER)),
    ]
    sig_tbl = Table([cust_lbl_row, cust_val_row],
                    colWidths=[PAGE_W*0.33, PAGE_W*0.37, PAGE_W*0.30])
    sig_tbl.setStyle(TableStyle([
        ("BOX",(0,0),(-1,-1),0.5,BORDER), ("INNERGRID",(0,0),(-1,-1),0.5,BORDER),
        ("BACKGROUND",(0,0),(-1,0), LGREY),
        ("TOPPADDING",(0,0),(-1,-1),5), ("BOTTOMPADDING",(0,0),(-1,-1),5),
        ("LEFTPADDING",(0,0),(-1,-1),6),
        ("ROWBACKGROUNDS",(0,1),(-1,1),[WHITE]),
        ("VALIGN",(0,1),(-1,1),"MIDDLE"),
        ("ALIGN",(1,1),(2,1),"CENTER"),
        ("MINROWHEIGHT",(0,1),(-1,1), 28*mm),
    ]))
    story.append(sig_tbl)

    # ══════════════════════════════════════════════════════════════════════════
    # 7. SERVICE ENGINEER / STATUS
    # ══════════════════════════════════════════════════════════════════════════
    status_text = (report.status or "PROBLEM RESOLVED").upper()
    status_bg   = PINK if "UNRESOLVED" in status_text else colors.HexColor("#E8F5E9")
    status_col  = RED  if "UNRESOLVED" in status_text else colors.HexColor("#2E7D32")

    eng_row = [
        [
            Paragraph(f"<b>SERVICE ENGINEER: {tech_name}</b>", ps("se",9,bold=True)),
            Paragraph(f"<b>STATUS: {status_text}</b>",
                      ps("st",9,bold=True,color=status_col,align=TA_CENTER)),
        ]
    ]
    eng_tbl = Table(eng_row, colWidths=[PAGE_W*0.45, PAGE_W*0.55])
    eng_tbl.setStyle(TableStyle([
        ("BOX",(0,0),(-1,-1),0.5,BORDER), ("INNERGRID",(0,0),(-1,-1),0.5,BORDER),
        ("BACKGROUND",(1,0),(1,0), status_bg),
        ("TOPPADDING",(0,0),(-1,-1),6), ("BOTTOMPADDING",(0,0),(-1,-1),6),
        ("LEFTPADDING",(0,0),(-1,-1),6),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ]))
    story.append(eng_tbl)

    # ── Technician signature row ───────────────────────────────────────────────
    tech_sig_row = [[
        Paragraph("<b>SERVICE ENGINEER SIGNATURE:</b>", ps("tes",9,bold=True)),
        sig_img(report.technician_signature, 60*mm, 18*mm),
    ]]
    tech_sig_tbl = Table(tech_sig_row, colWidths=[PAGE_W*0.35, PAGE_W*0.65])
    tech_sig_tbl.setStyle(TableStyle([
        ("BOX",(0,0),(-1,-1),0.5,BORDER), ("INNERGRID",(0,0),(-1,-1),0.5,BORDER),
        ("TOPPADDING",(0,0),(-1,-1),5), ("BOTTOMPADDING",(0,0),(-1,-1),5),
        ("LEFTPADDING",(0,0),(-1,-1),6),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("MINROWHEIGHT",(0,0),(-1,0), 22*mm),
    ]))
    story.append(tech_sig_tbl)

    # ── Customer remarks ──────────────────────────────────────────────────────
    rem_row = [[Paragraph(f"<b>Customer Remarks:</b> {val(report.customer_remarks)}", ps("rem",9))]]
    rem_tbl = Table(rem_row, colWidths=[PAGE_W])
    rem_tbl.setStyle(TableStyle([
        ("BOX",(0,0),(-1,-1),0.5,BORDER),
        ("TOPPADDING",(0,0),(-1,-1),5), ("BOTTOMPADDING",(0,0),(-1,-1),5),
        ("LEFTPADDING",(0,0),(-1,-1),6),
    ]))
    story.append(rem_tbl)

    # ── Footer ────────────────────────────────────────────────────────────────
    footer_data = [[Paragraph(
        f"{COMPANY_EMAIL}&nbsp;&nbsp;&nbsp;&nbsp;{COMPANY_TEL}",
        ps("ft",8,align=TA_CENTER)
    )]]
    footer_tbl = Table(footer_data, colWidths=[PAGE_W])
    footer_tbl.setStyle(TableStyle([
        ("TOPPADDING",(0,0),(-1,-1),5), ("BOTTOMPADDING",(0,0),(-1,-1),3),
        ("ALIGN",(0,0),(-1,-1),"CENTER"),
    ]))
    story.append(footer_tbl)

    doc.build(story)
    return rel_path


def _fmt(r: ServiceReport, base_url: str = ""):
    return {
        "id": r.id,
        "field_report_id":    r.field_report_id,
        "task_id":            r.task_id,
        "employee_id":        r.employee_id,
        "school_id":          r.school_id,
        "school_name":        r.school.name   if r.school   else None,
        "employee_name":      r.employee.name if r.employee else None,
        "report_date":        r.report_date.isoformat() if r.report_date else None,
        "report_no":          r.report_no,
        "serial_no":          r.serial_no,
        "complaint_no":       r.complaint_no,
        "unit_type":          r.unit_type,
        "problem_description":r.problem_description,
        "observation":        r.observation,
        "action_taken":       r.action_taken,
        "spare_parts":        r.spare_parts,
        "plant_capacity":     r.plant_capacity,
        "design_rw_tds":      r.design_rw_tds,
        "free_chlorine_rw":   r.free_chlorine_rw,
        "hours_running":      r.hours_running,
        "membrane_condition": r.membrane_condition,
        "uv_lamp_condition":  r.uv_lamp_condition,
        "sensors_condition":  r.sensors_condition,
        "prefilter_condition":r.prefilter_condition,
        "tds_input":          r.tds_input,
        "tds_output":         r.tds_output,
        "voltage":            r.voltage,
        "flow_rate":          r.flow_rate,
        "current_amps":       r.current_amps,
        "principal_name":     r.principal_name,
        "customer_mobile":    r.customer_mobile,
        "customer_remarks":   r.customer_remarks,
        "status":             r.status,
        "pdf_url":            f"{base_url}/uploads/{r.pdf_path}" if r.pdf_path else None,
        "created_at":         r.created_at.isoformat() if r.created_at else None,
    }


def sync_verification(field_report_id: int, verification_status: str, db: Session) -> None:
    """Called whenever a FieldReport's verification_status changes.
    Assigns a permanent unique serial number the first time a report is verified,
    then regenerates the PDF so the school stamp only appears while currently verified."""
    report = db.query(ServiceReport).filter(ServiceReport.field_report_id == field_report_id).first()
    if not report:
        return
    if verification_status == "verified" and not report.serial_no:
        count = db.query(ServiceReport).filter(ServiceReport.serial_no.isnot(None)).count()
        report.serial_no = f"SR-{str(count + 1).zfill(6)}"
        db.flush()
    try:
        pdf_rel = _generate_pdf(report, db)
        if pdf_rel:
            report.pdf_path = pdf_rel
    except Exception as e:
        print(f"PDF regeneration error (non-fatal): {e}")


@router.post("/")
def create_service_report(request: Request, req: CreateServiceReport, db: Session = Depends(get_db), user=Depends(get_current_user)):
    try:
        today = today_ist()
        base_url = str(request.base_url).rstrip("/")

        report = ServiceReport(
            field_report_id=req.field_report_id, task_id=req.task_id,
            employee_id=user.id, school_id=req.school_id, report_date=today,
            report_no=req.report_no, complaint_no=req.complaint_no, unit_type=req.unit_type,
            problem_description=req.problem_description, observation=req.observation,
            action_taken=req.action_taken, spare_parts=req.spare_parts,
            plant_capacity=req.plant_capacity, design_rw_tds=req.design_rw_tds,
            free_chlorine_rw=req.free_chlorine_rw, hours_running=req.hours_running,
            membrane_condition=req.membrane_condition or "OK",
            uv_lamp_condition=req.uv_lamp_condition or "OK",
            sensors_condition=req.sensors_condition or "OK",
            prefilter_condition=req.prefilter_condition or "OK",
            tds_input=req.tds_input, tds_output=req.tds_output,
            voltage=req.voltage, flow_rate=req.flow_rate,
            current_amps=req.current_amps,
            principal_name=req.principal_name, customer_mobile=req.customer_mobile,
            customer_remarks=req.customer_remarks, status=req.status or "PROBLEM RESOLVED",
        )
        db.add(report)

        if req.school_id:
            school = db.query(School).filter(School.id == req.school_id).first()
            if school:
                school.plant_condition = "working" if report.status == "PROBLEM RESOLVED" else "not_working"

        db.flush()

        sig_dir = os.path.join(UPLOADS_DIR, "signatures", str(today.year), str(today.month))
        os.makedirs(sig_dir, exist_ok=True)

        if req.technician_signature_b64:
            rel = f"signatures/{today.year}/{today.month}/tech_{report.id}.png"
            _save_b64_image(req.technician_signature_b64, os.path.join(UPLOADS_DIR, rel))
            report.technician_signature = rel

        if req.principal_signature_b64:
            rel = f"signatures/{today.year}/{today.month}/principal_{report.id}.png"
            _save_b64_image(req.principal_signature_b64, os.path.join(UPLOADS_DIR, rel))
            report.principal_signature = rel

        db.flush()

        try:
            pdf_rel = _generate_pdf(report, db)
            if pdf_rel:
                report.pdf_path = pdf_rel
        except Exception as pdf_err:
            print(f"PDF generation error (non-fatal): {pdf_err}")

        db.commit()
        db.refresh(report)
        return _fmt(report, base_url=base_url)

    except HTTPException:
        raise
    except Exception as e:
        try: db.rollback()
        except Exception: pass
        raise HTTPException(500, f"Service report failed: {str(e)}")


@router.get("/")
def list_reports(request: Request, db: Session = Depends(get_db), user=Depends(get_current_user)):
    base_url = str(request.base_url).rstrip("/")
    q = db.query(ServiceReport)
    if user.role not in ("admin", "deskwork"):
        q = q.filter(ServiceReport.employee_id == user.id)
    return [_fmt(r, base_url=base_url) for r in q.order_by(ServiceReport.created_at.desc()).limit(200).all()]


@router.get("/{report_id}/pdf")
def download_pdf(report_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    r = db.query(ServiceReport).filter(ServiceReport.id == report_id).first()
    if not r:
        raise HTTPException(404, "Not found")
    if user.role not in ("admin", "deskwork") and r.employee_id != user.id:
        raise HTTPException(403, "Access denied")

    if not r.pdf_path or not os.path.exists(os.path.join(UPLOADS_DIR, r.pdf_path)):
        pdf_rel = _generate_pdf(r, db)
        if pdf_rel:
            r.pdf_path = pdf_rel
            db.commit()

    if not r.pdf_path:
        raise HTTPException(500, "PDF generation failed — install reportlab")

    abs_path = os.path.join(UPLOADS_DIR, r.pdf_path)
    return FileResponse(abs_path, media_type="application/pdf",
                        filename=f"service_report_{r.id}_{r.report_date}.pdf")
