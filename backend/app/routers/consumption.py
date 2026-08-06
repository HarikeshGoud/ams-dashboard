"""Consumables & spares consumption — billing rates, and the summary the client is sent.

Two things live here, kept apart on purpose:

  RATES. What a client is billed per unit. StockItem.unit_cost is what the part COST to buy and
  has to stay that, so the billed rate is a separate figure held per (client, item).

  THE SUMMARY. Quantities actually used over a period, filtered the way the operator asks, with
  each line's rate, amount, GST and grand total. It reads ProofItemUsage — the per-item
  quantities recorded when a technician submits a proof — not the stock ledger, because stock
  deduction only happens when the technician holds that batch and is therefore incomplete.

Deliberately NOT done here: the numbers are returned, never frozen. The operator reviews and
edits quantities and rates, and enters the GST percentage, before the document is produced. So
this endpoint answers "what does the data say", and the person sending the bill decides what it
says. Nothing here writes an invoice or marks anything as billed.
"""
from decimal import Decimal
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from datetime import date

from ..database import get_db
from ..models.consumption import ProofItemUsage, ClientItemRate
from ..models.stock import StockItem
from ..models.school import School
from ..models.client import Client
from ..dependencies import get_current_user, require_admin_or_deskwork

router = APIRouter(prefix="/api/consumption", tags=["consumption"])

# The sheet is split into sections by plant size, and the stock categories already carry that
# distinction, so no new configuration is needed — these are the real category names.
SECTION_ORDER = ["1000/1500/2000 LPH RO Units", "50/100 LPH RO Units"]

DEFAULT_GST = Decimal("18")


def _num(v) -> float:
    return float(v) if v is not None else 0.0


# ── Rates ─────────────────────────────────────────────────────────────────────

class RateIn(BaseModel):
    item_id: int
    rate: float


class RatesUpdate(BaseModel):
    client_id: int
    rates: List[RateIn]
    gst_percent: Optional[float] = None


@router.get("/rates")
def list_rates(client_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Every active item with this client's agreed rate. Unset rates come back as null.

    Null rather than falling back to unit_cost: billing a customer at cost price by accident is
    a worse outcome than an obviously blank cell the operator has to fill in.
    """
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Admin or deskwork only")
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(404, "Client not found")

    rates = {r.item_id: r for r in
             db.query(ClientItemRate).filter(ClientItemRate.client_id == client_id).all()}
    gst = next((r.gst_percent for r in rates.values() if r.gst_percent is not None), None)

    items = (db.query(StockItem).filter(StockItem.is_active == True)
               .order_by(StockItem.category, StockItem.name).all())
    return {
        "client": {"id": client.id, "name": client.name},
        "gst_percent": _num(gst) if gst is not None else float(DEFAULT_GST),
        "items": [{
            "item_id": i.id,
            "name": i.name,
            "category": i.category,
            "unit": i.unit or "Nos",
            # Shown so the operator can see the margin while setting a rate. Never billed.
            "unit_cost": _num(i.unit_cost),
            "rate": _num(rates[i.id].rate) if i.id in rates else None,
        } for i in items],
    }


@router.post("/rates")
def set_rates(data: RatesUpdate, db: Session = Depends(get_db),
              user=Depends(require_admin_or_deskwork)):
    """Upsert this client's rates. Only the items sent are touched."""
    if not db.query(Client).filter(Client.id == data.client_id).first():
        raise HTTPException(404, "Client not found")

    existing = {r.item_id: r for r in
                db.query(ClientItemRate).filter(ClientItemRate.client_id == data.client_id).all()}
    valid_items = {i for (i,) in db.query(StockItem.id).all()}

    saved = 0
    for entry in data.rates:
        if entry.item_id not in valid_items:
            continue
        if entry.rate < 0:
            raise HTTPException(400, f"Rate for item {entry.item_id} cannot be negative")
        row = existing.get(entry.item_id)
        if row:
            row.rate = entry.rate
            row.updated_by = user.id
        else:
            row = ClientItemRate(client_id=data.client_id, item_id=entry.item_id,
                                 rate=entry.rate, updated_by=user.id)
            db.add(row)
            existing[entry.item_id] = row
        saved += 1

    if data.gst_percent is not None:
        if not (0 <= data.gst_percent <= 100):
            raise HTTPException(400, "GST percent must be between 0 and 100")
        # Stored on every row for this client so any of them can answer "what's the default".
        for row in existing.values():
            row.gst_percent = data.gst_percent

    db.commit()
    return {"ok": True, "saved": saved}


# ── Summary ───────────────────────────────────────────────────────────────────

@router.get("/summary")
def consumption_summary(
    date_from: str,
    date_to: str,
    client_id: Optional[int] = None,
    segment: Optional[str] = None,          # temple / school / hospital / village / ...
    contract_type: Optional[str] = None,    # amc / warranty / chargeable / others
    school_id: Optional[int] = None,        # one specific site
    unit_number: Optional[str] = None,
    gst_percent: Optional[float] = None,
    db: Session = Depends(get_db), user=Depends(get_current_user),
):
    """Quantity used per item over a period, with rates, ready for the operator to review.

    Every filter is optional except the dates. A filter on the SITE is applied by joining the
    usage rows to schools — usage carries school_id, unlike the stock ledger, which only ever
    recorded a destination NAME and so cannot tell fourteen different "POLICE STATION" sites
    apart.
    """
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Admin or deskwork only")
    try:
        d_from = date.fromisoformat(date_from)
        d_to   = date.fromisoformat(date_to)
    except ValueError:
        raise HTTPException(400, "Dates must be YYYY-MM-DD")
    if d_to < d_from:
        raise HTTPException(400, "date_to is before date_from")

    q = (db.query(ProofItemUsage.item_id,
                  func.sum(ProofItemUsage.quantity).label("qty"),
                  func.count(func.distinct(ProofItemUsage.school_id)).label("sites"))
           .join(School, School.id == ProofItemUsage.school_id)
           .filter(ProofItemUsage.usage_date >= d_from,
                   ProofItemUsage.usage_date <= d_to))

    if segment:
        q = q.filter(School.model == segment)
    if contract_type:
        q = q.filter(School.amc_status == contract_type)
    if school_id:
        q = q.filter(School.id == school_id)
    if unit_number:
        q = q.filter(School.unit_number == unit_number)
    if client_id:
        q = q.filter(School.client_id == client_id)

    rows = q.group_by(ProofItemUsage.item_id).all()

    # Which sites the figures actually came from — the sheet's title says "(7 Temples)", and that
    # count has to be the real one, not the number of sites matching the filter.
    site_q = (db.query(School.id, School.name)
                .join(ProofItemUsage, ProofItemUsage.school_id == School.id)
                .filter(ProofItemUsage.usage_date >= d_from,
                        ProofItemUsage.usage_date <= d_to))
    if segment:        site_q = site_q.filter(School.model == segment)
    if contract_type:  site_q = site_q.filter(School.amc_status == contract_type)
    if school_id:      site_q = site_q.filter(School.id == school_id)
    if unit_number:    site_q = site_q.filter(School.unit_number == unit_number)
    if client_id:      site_q = site_q.filter(School.client_id == client_id)
    sites = sorted({(sid, nm) for sid, nm in site_q.distinct().all()}, key=lambda s: s[1] or "")

    rates = {}
    client_name = None
    if client_id:
        client = db.query(Client).filter(Client.id == client_id).first()
        if not client:
            raise HTTPException(404, "Client not found")
        client_name = client.name
        rates = {r.item_id: r for r in
                 db.query(ClientItemRate).filter(ClientItemRate.client_id == client_id).all()}

    gst = Decimal(str(gst_percent)) if gst_percent is not None else None
    if gst is None:
        stored = next((r.gst_percent for r in rates.values() if r.gst_percent is not None), None)
        gst = Decimal(str(stored)) if stored is not None else DEFAULT_GST
    if not (0 <= gst <= 100):
        raise HTTPException(400, "GST percent must be between 0 and 100")

    items = {i.id: i for i in db.query(StockItem)
             .filter(StockItem.id.in_([r.item_id for r in rows])).all()} if rows else {}

    lines = []
    for r in rows:
        item = items.get(r.item_id)
        if not item:
            continue
        rate = rates[r.item_id].rate if r.item_id in rates else None
        qty = Decimal(str(r.qty or 0))
        amount = (Decimal(str(rate)) * qty) if rate is not None else None
        lines.append({
            "item_id": item.id,
            "description": item.name,
            "category": item.category,
            "unit": item.unit or "Nos",
            "rate": _num(rate) if rate is not None else None,
            "total_qty": float(qty),
            "total_amount": _num(amount) if amount is not None else None,
            "sites_used_at": r.sites,
            # Surfaced so a blank rate is visibly a missing agreement, not a zero-priced part.
            "rate_missing": rate is None,
        })

    # Section order follows the sheet: big plants first, then small, then anything else.
    def section_key(line):
        cat = line["category"] or ""
        return (SECTION_ORDER.index(cat) if cat in SECTION_ORDER else len(SECTION_ORDER),
                cat, line["description"] or "")
    lines.sort(key=section_key)

    priced = [l for l in lines if l["total_amount"] is not None]
    subtotal = sum(Decimal(str(l["total_amount"])) for l in priced) if priced else Decimal("0")
    gst_amount = (subtotal * gst / Decimal("100")).quantize(Decimal("0.01"))

    return {
        "period": {"from": str(d_from), "to": str(d_to)},
        "filters": {"client_id": client_id, "client_name": client_name, "segment": segment,
                    "contract_type": contract_type, "school_id": school_id,
                    "unit_number": unit_number},
        "sites": [{"id": s[0], "name": s[1]} for s in sites],
        "site_count": len(sites),
        "gst_percent": float(gst),
        "lines": lines,
        "totals": {
            "total_amount": float(subtotal),
            "gst_amount": float(gst_amount),
            "grand_total": float(subtotal + gst_amount),
        },
        # So the page can say WHY it is empty rather than showing a blank sheet.
        "lines_missing_rate": sum(1 for l in lines if l["rate_missing"]),
        "empty_reason": None if lines else (
            "No item usage recorded in this period for those filters. Quantities are captured "
            "when a technician submits a proof with items selected."
        ),
    }
