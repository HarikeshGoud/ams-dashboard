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
from ..models.stock import StockItem, StockLedger
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

    site_filtered = any([segment, contract_type, school_id, unit_number, client_id])

    def site_matches(s: School) -> bool:
        if s is None:
            return False
        if segment and s.model != segment:                 return False
        if contract_type and s.amc_status != contract_type: return False
        if school_id and s.id != school_id:                 return False
        if unit_number and s.unit_number != unit_number:    return False
        if client_id and s.client_id != client_id:          return False
        return True

    # totals[item_id] = {"qty": Decimal, "sites": set}
    totals: dict = {}
    sites_seen: dict = {}

    def add(item_id: int, qty, school: Optional[School]):
        t = totals.setdefault(item_id, {"qty": Decimal("0"), "sites": set()})
        t["qty"] += Decimal(str(qty or 0))
        if school is not None:
            t["sites"].add(school.id)
            sites_seen[school.id] = school.name

    # ── Source 1: usage recorded on the proof itself ──────────────────────────
    pu = (db.query(ProofItemUsage)
            .filter(ProofItemUsage.usage_date >= d_from,
                    ProofItemUsage.usage_date <= d_to).all())
    # (employee, item, date) already accounted for here. A proof from a technician who IS
    # holding stock writes BOTH a usage row and a stock 'install' ledger row, so without this
    # the same consumption would be counted twice and the bill would be double.
    covered = set()
    for u in pu:
        school = u.school
        if site_filtered and not site_matches(school):
            continue
        add(u.item_id, u.quantity, school)
        covered.add((u.employee_id, u.item_id, u.usage_date))

    # ── Source 2: stock 'install' ledger rows ─────────────────────────────────
    # These predate the usage table and are the only record of everything installed before it
    # existed — the Stock page's "Installed" figure is built from exactly these rows, so leaving
    # them out made the summary disagree with Stock.
    #
    # They carry the destination as a NAME, not an id. Where that name identifies exactly one
    # active site the filters apply normally; where it is blank, unknown, or shared by several
    # sites (there are fourteen called "POLICE STATION") the row cannot be attributed, and that
    # is reported rather than silently dropped or silently included.
    by_name: dict = {}
    for s in db.query(School).filter(School.is_active == True).all():
        key = (s.name or "").strip().lower()
        if key:
            by_name.setdefault(key, []).append(s)

    unattributed = {"rows": 0, "quantity": 0.0, "names": set()}
    ledger = (db.query(StockLedger)
                .filter(StockLedger.transaction_type == "install",
                        func.date(StockLedger.created_at) >= d_from,
                        func.date(StockLedger.created_at) <= d_to).all())
    for e in ledger:
        if (e.employee_id, e.item_id, e.created_at.date() if e.created_at else None) in covered:
            continue                                   # already counted from the proof
        candidates = by_name.get((e.school_dest or "").strip().lower(), [])
        school = candidates[0] if len(candidates) == 1 else None
        if school is None:
            # Unresolvable. Include it only in a total that isn't scoped to particular sites,
            # and say so either way — a bill built on a silently short figure is worse than one
            # the operator knows is incomplete.
            unattributed["rows"] += 1
            unattributed["quantity"] += float(e.quantity or 0)
            if (e.school_dest or "").strip():
                unattributed["names"].add(e.school_dest.strip())
            if site_filtered:
                continue
            add(e.item_id, e.quantity, None)
            continue
        if site_filtered and not site_matches(school):
            continue
        add(e.item_id, e.quantity, school)

    rows = [type("R", (), {"item_id": k, "qty": v["qty"], "sites": len(v["sites"])})()
            for k, v in totals.items()]
    sites = sorted(sites_seen.items(), key=lambda s: s[1] or "")

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
        # Older stock installs whose destination name matches no single site. Surfaced so a
        # figure that is knowably incomplete never passes for a complete one.
        "unattributed": {
            "rows": unattributed["rows"],
            "quantity": round(unattributed["quantity"], 2),
            "names": sorted(unattributed["names"])[:20],
            "excluded_by_filters": bool(site_filtered and unattributed["rows"]),
        },
        "empty_reason": None if lines else (
            "No item usage recorded in this period for those filters. Consumption comes from "
            "quantities on submitted proofs and from stock marked installed at a site."
        ),
    }
