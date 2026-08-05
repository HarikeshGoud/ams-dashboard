import json, logging, os, httpx, aiofiles
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
from ..database import get_db
from ..models.travel import TravelTrip, FuelSettings
from ..models.employee import Employee
from ..models.mandal import Mandal
from ..models.day_start import DayStart
from ..storage import UPLOADS_DIR
from ..dependencies import get_current_user, require_admin_or_deskwork

router = APIRouter(prefix="/api/travel", tags=["travel"])

logger = logging.getLogger("ams")

EXTRA_AMOUNT = 50  # fixed extra Rs added to every trip

def _travel_enabled_for_employee(db, emp) -> bool:
    """False when travel is globally hidden, or the employee's mandal is marked
    not eligible for travel allowance."""
    settings = db.query(FuelSettings).order_by(FuelSettings.id.desc()).first()
    if settings and settings.hide_travel:
        return False
    if emp and emp.mandal_id:
        m = db.query(Mandal).filter(Mandal.id == emp.mandal_id).first()
        if m and m.travel_eligible is False:
            return False
    return True

# ── helpers ──────────────────────────────────────────────────────────────────

def _fmt(t: TravelTrip):
    legs = []
    if t.route_legs:
        try: legs = json.loads(t.route_legs)
        except: legs = []
    return {
        "id": t.id,
        "employee_id": t.employee_id,
        "employee_name": t.employee.name if t.employee else None,
        "trip_date": t.trip_date.isoformat() if t.trip_date else None,
        "from_location": t.from_location,
        "to_location": t.to_location,
        "purpose": t.purpose,
        "distance_km": float(t.distance_km or 0),
        "transport_mode": t.transport_mode,
        "amount": float(t.amount or 0),
        "status": t.status,
        "notes": t.notes,
        "route_legs": legs,
        "fuel_price_used": t.fuel_price_used,
        "mileage_used": t.mileage_used,
        "calculated_amount": t.calculated_amount,
        "start_lat": t.start_lat,
        "start_lng": t.start_lng,
        "trip_type": t.trip_type or "manual",
        "rate_per_km_used": t.rate_per_km_used,
    }


async def _osrm_distance(lat1, lng1, lat2, lng2) -> float:
    """Return road distance in km between two points using OSRM public server."""
    url = f"http://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=false"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(url)
            data = r.json()
            if data.get("code") == "Ok":
                meters = data["routes"][0]["distance"]
                return round(meters / 1000, 2)
    except Exception:
        pass
    # Haversine fallback
    import math
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return round(R * 2 * math.asin(math.sqrt(a)) * 1.35, 2)


# ── Pydantic models ───────────────────────────────────────────────────────────

class RouteLeg(BaseModel):
    label: str          # school name or "Return home"
    school_id: Optional[int] = None
    lat: float
    lng: float

class TripCreate(BaseModel):
    trip_date: str
    from_location: str
    start_lat: float
    start_lng: float
    transport_mode: str = "bike"
    mileage: float              # km per litre — saved to employee profile too
    purpose: Optional[str] = None
    notes: Optional[str] = None
    legs: List[RouteLeg]        # ordered list of visit waypoints


class MileageUpdate(BaseModel):
    bike_mileage: float
    home_location: Optional[str] = None
    home_lat: Optional[float] = None
    home_lng: Optional[float] = None


# ── Fuel settings ─────────────────────────────────────────────────────────────

@router.get("/fuel-settings")
def get_fuel_settings(db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(FuelSettings).order_by(FuelSettings.id.desc()).first()
    if not row:
        return {"fuel_price": 105.0, "rate_per_km": 0.0, "hide_travel": False, "updated_at": None}
    return {
        "fuel_price": row.fuel_price,
        "rate_per_km": row.rate_per_km or 0.0,
        "hide_travel": bool(row.hide_travel),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


class FuelSettingsUpdate(BaseModel):
    fuel_price: float
    rate_per_km: Optional[float] = 0.0
    hide_travel: Optional[bool] = None   # master switch — hide Travel from all technicians


@router.post("/fuel-settings")
def set_fuel_settings(data: FuelSettingsUpdate, db: Session = Depends(get_db), user=Depends(require_admin_or_deskwork)):
    row = db.query(FuelSettings).order_by(FuelSettings.id.desc()).first()
    new_rate = data.rate_per_km or 0.0
    new_fuel = data.fuel_price
    if row:
        # hide_travel is a single global switch with no history, and while it is on EVERY
        # technician's trip creation is silently skipped — no error, no trip, nothing to
        # show it happened. That is how a week of allowances went missing. At minimum the
        # change has to leave a trace of who flipped it and when.
        if data.hide_travel is not None and bool(data.hide_travel) != bool(row.hide_travel):
            logger.warning(
                f"[travel] hide_travel {bool(row.hide_travel)} -> {bool(data.hide_travel)} "
                f"by {user.name} (id {user.id}). While ON, NO travel trips are created for "
                f"anyone — allowances stop accruing silently.")
        row.fuel_price = new_fuel
        row.rate_per_km = new_rate
        if data.hide_travel is not None:
            row.hide_travel = data.hide_travel
        row.set_by = user.id
        row.updated_at = datetime.utcnow()
    else:
        db.add(FuelSettings(fuel_price=new_fuel, rate_per_km=new_rate,
                            hide_travel=bool(data.hide_travel), set_by=user.id))
    db.commit()

    # Recalculate all pending auto trips with the new rate
    pending_trips = db.query(TravelTrip).filter(
        TravelTrip.status == "pending",
        TravelTrip.trip_type == "auto",
    ).all()
    for t in pending_trips:
        km = float(t.distance_km or 0)
        mileage = t.mileage_used or 45.0
        if new_rate > 0:
            new_amount = round(km * new_rate, 2)
            t.rate_per_km_used = new_rate
        else:
            new_amount = round((km / mileage) * new_fuel + EXTRA_AMOUNT, 2) if mileage > 0 else EXTRA_AMOUNT
            t.rate_per_km_used = None
            t.fuel_price_used = new_fuel
        t.amount = new_amount
        t.calculated_amount = new_amount
    db.commit()

    hide_now = db.query(FuelSettings).order_by(FuelSettings.id.desc()).first().hide_travel
    return {"ok": True, "fuel_price": new_fuel, "rate_per_km": new_rate,
            "hide_travel": bool(hide_now), "recalculated": len(pending_trips)}


@router.get("/my-access")
def travel_access(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Whether the current user should see the Travel page. Admin/deskwork always
    manage it; technicians only when travel isn't globally hidden AND their mandal
    is eligible for travel allowance."""
    if user.role in ("admin", "deskwork"):
        return {"can_access": True}
    emp = db.query(Employee).filter(Employee.id == user.id).first()
    return {"can_access": _travel_enabled_for_employee(db, emp)}


# ── Mileage / home location ───────────────────────────────────────────────────

@router.patch("/my-profile")
def update_mileage(data: MileageUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    emp = db.query(Employee).filter(Employee.id == user.id).first()
    emp.bike_mileage = data.bike_mileage
    if data.home_location:
        emp.home_location = data.home_location
    if data.home_lat is not None:
        emp.home_lat = data.home_lat
    if data.home_lng is not None:
        emp.home_lng = data.home_lng
    db.commit()
    return {"ok": True, "bike_mileage": emp.bike_mileage, "home_location": emp.home_location,
            "home_lat": emp.home_lat, "home_lng": emp.home_lng}


@router.get("/my-profile")
def get_my_profile(db: Session = Depends(get_db), user=Depends(get_current_user)):
    emp = db.query(Employee).filter(Employee.id == user.id).first()
    return {
        "bike_mileage": emp.bike_mileage or 45.0,
        "home_location": emp.home_location or "",
        "home_lat": emp.home_lat,
        "home_lng": emp.home_lng,
    }


# ── Distance calculation (OSRM proxy) ────────────────────────────────────────

class RouteCalcRequest(BaseModel):
    points: List[RouteLeg]   # ordered: [start, v1, v2, ...]

@router.post("/calculate-route")
async def calculate_route(data: RouteCalcRequest):
    """Calculate road distance for each consecutive leg using OSRM."""
    if len(data.points) < 2:
        return {"legs": [], "total_km": 0}

    legs = []
    total = 0.0
    for i in range(len(data.points) - 1):
        a = data.points[i]
        b = data.points[i + 1]
        dist = await _osrm_distance(a.lat, a.lng, b.lat, b.lng)
        legs.append({
            "from": a.label,
            "to": b.label,
            "distance_km": dist,
            "school_id": b.school_id,
        })
        total += dist

    return {"legs": legs, "total_km": round(total, 2)}


# ── Auto-calculate trip from today's geotagged field reports ─────────────────

def _fmt_day_start(ds: DayStart, base_url: str = ""):
    return {
        "id": ds.id,
        "employee_id": ds.employee_id,
        "start_date": ds.start_date.isoformat() if ds.start_date else None,
        "latitude": ds.latitude,
        "longitude": ds.longitude,
        "label": ds.label or "Home",
        "photo_url": f"{base_url}/uploads/{ds.photo_path}" if (ds.photo_path and base_url) else None,
        "created_at": ds.created_at.isoformat() if ds.created_at else None,
    }


@router.get("/day-start")
def get_day_start(start_date: Optional[str] = None, employee_id: Optional[int] = None,
                  request: Request = None,
                  db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Today's start-from-home record, or None. Used to show whether it's already been done."""
    emp_id = employee_id or user.id
    if user.role not in ("admin", "deskwork") and user.id != emp_id:
        raise HTTPException(403, "Not authorized")
    try:
        d = date.fromisoformat(start_date) if start_date else date.today()
    except ValueError:
        raise HTTPException(400, f"Invalid date '{start_date}' — use YYYY-MM-DD")
    ds = db.query(DayStart).filter(DayStart.employee_id == emp_id,
                                   DayStart.start_date == d).first()
    if not ds:
        return None
    base_url = str(request.base_url).rstrip("/") if request else ""
    return _fmt_day_start(ds, base_url)


@router.post("/day-start")
async def set_day_start(request: Request, db: Session = Depends(get_db),
                        user=Depends(get_current_user)):
    """Record where the technician is setting off from, with a photo.

    Multipart, mirroring the proof-submit endpoint: `photo` plus `latitude`/`longitude`, and
    optionally `label` and `start_date`. GPS is required — the whole point is the coordinate,
    and a record without one would add a waypoint the travel maths can't use.

    Re-tapping replaces the row rather than adding a second: the reading that matters is from
    when they actually left, and two "starts" would make the first leg ambiguous.
    """
    form = await request.form()
    lat_raw, lng_raw = form.get("latitude"), form.get("longitude")
    if not lat_raw or not lng_raw:
        raise HTTPException(400, "GPS location is required — wait for the lock before saving.")
    try:
        latitude, longitude = float(lat_raw), float(lng_raw)
    except ValueError:
        raise HTTPException(400, "Latitude and longitude must be numbers")

    try:
        d = date.fromisoformat(form.get("start_date")) if form.get("start_date") else date.today()
    except ValueError:
        raise HTTPException(400, "start_date must be YYYY-MM-DD")

    label = (form.get("label") or "Home").strip()[:120] or "Home"

    ds = db.query(DayStart).filter(DayStart.employee_id == user.id,
                                   DayStart.start_date == d).first()
    if ds:
        ds.latitude, ds.longitude, ds.label = latitude, longitude, label
    else:
        ds = DayStart(employee_id=user.id, start_date=d, latitude=latitude,
                      longitude=longitude, label=label)
        db.add(ds)
    db.flush()

    photo = form.get("photo")
    if photo is not None and getattr(photo, "filename", None):
        os.makedirs(os.path.join(UPLOADS_DIR, str(d.year), str(d.month)), exist_ok=True)
        ext = photo.filename.rsplit(".", 1)[-1] if "." in photo.filename else "jpg"
        fname = f"{d.year}/{d.month}/daystart_emp{user.id}_{d.isoformat()}.{ext}"
        try:
            contents = await photo.read()
            if contents:
                async with aiofiles.open(os.path.join(UPLOADS_DIR, fname), "wb") as f:
                    await f.write(contents)
                ds.photo_path = fname
        except Exception as e:
            # The coordinate is the part travel needs, so a failed image write must not lose
            # the whole record — but say so rather than reporting a clean save.
            logger.exception(f"day-start photo save failed for employee {user.id}: {e}")
            db.commit()
            raise HTTPException(500, "Start point saved, but the photo could not be stored.")

    db.commit()
    db.refresh(ds)

    # Recalculate today's travel straight away so the first leg appears without waiting for
    # the next proof submission.
    recalc = None
    try:
        recalc = await auto_trip_from_reports(trip_date=str(d), employee_id=user.id,
                                              db=db, user=user)
    except Exception as e:
        logger.warning(f"day-start travel recalc skipped for employee {user.id}: {e}")

    base_url = str(request.base_url).rstrip("/")
    return {"ok": True, "day_start": _fmt_day_start(ds, base_url), "travel": recalc}


@router.post("/auto-from-reports")
async def auto_trip_from_reports(
    trip_date: Optional[str] = None,
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """
    Auto-create or update a travel trip for a technician based on the GPS
    coordinates embedded in today's field report submissions (geotagged photos).
    Called automatically after each proof submission.
    """
    from ..models.field_report import FieldReport
    from datetime import date as date_type

    emp_id = employee_id or user.id
    d = date_type.fromisoformat(trip_date) if trip_date else date_type.today()

    # Only proceed if we have permission
    if user.role not in ("admin", "deskwork") and user.id != emp_id:
        raise HTTPException(403, "Not authorized")

    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(404, "Employee not found")

    # Skip auto travel when this technician's area isn't eligible (or globally hidden)
    if not _travel_enabled_for_employee(db, emp):
        return {"ok": False, "message": "Travel allowance is disabled for this technician's area"}

    # Get ALL today's reports sorted by submission time (GPS optional)
    reports = (
        db.query(FieldReport)
        .filter(
            FieldReport.employee_id == emp_id,
            FieldReport.report_date == d,
        )
        .order_by(FieldReport.submitted_at)
        .all()
    )

    if not reports:
        return {"ok": False, "message": "No proof submissions found for today"}

    fuel_row = db.query(FuelSettings).order_by(FuelSettings.id.desc()).first()
    fuel_price = fuel_row.fuel_price if fuel_row else 105.0
    rate_per_km = (fuel_row.rate_per_km or 0.0) if fuel_row else 0.0
    mileage = emp.bike_mileage or 45.0

    # Build waypoints from proof GPS only — no fallback to school coords
    from ..models.school import School
    waypoints = []
    seen_school_ids = set()

    # If the technician recorded where they set off from, that is waypoint zero. Without it the
    # first waypoint is the first SITE, so the ride from home to it was never paid for. Two
    # side effects worth knowing: a day with a single visit now yields a real trip where before
    # it fell under the two-point minimum and paid nothing, and the leg is only ever added when
    # a record exists — nothing is inferred for days where the technician didn't mark it.
    day_start = db.query(DayStart).filter(
        DayStart.employee_id == emp_id, DayStart.start_date == d
    ).first()
    if day_start and day_start.latitude is not None and day_start.longitude is not None:
        waypoints.append({
            "label": day_start.label or "Home",
            "lat": day_start.latitude,
            "lng": day_start.longitude,
            "school_id": None,
        })

    for r in reports:
        if r.school_id in seen_school_ids:
            continue
        seen_school_ids.add(r.school_id)

        if r.latitude is None or r.longitude is None:
            continue   # proof had no GPS — skip

        school_name = None
        if r.school_id:
            sch = db.query(School).filter(School.id == r.school_id).first()
            school_name = sch.name if sch else f"School #{r.school_id}"

        waypoints.append({
            "label": school_name or f"Visit {len(waypoints)+1}",
            "lat": r.latitude,
            "lng": r.longitude,
            "school_id": r.school_id,
        })

    if len(waypoints) < 2:
        return {"ok": False, "message": "Need at least 2 GPS points to calculate distance"}

    # Calculate distances via OSRM
    legs_result = []
    total_km = 0.0
    for i in range(len(waypoints) - 1):
        a = waypoints[i]
        b = waypoints[i + 1]
        dist = await _osrm_distance(a["lat"], a["lng"], b["lat"], b["lng"])
        legs_result.append({
            "from": a["label"],
            "to": b["label"],
            "distance_km": dist,
            "school_id": b["school_id"],
        })
        total_km += dist

    total_km = round(total_km, 2)
    # Use flat rate if admin has set one, otherwise fuel formula
    if rate_per_km and rate_per_km > 0:
        calculated = round(total_km * rate_per_km, 2)
    else:
        calculated = round((total_km / mileage) * fuel_price + EXTRA_AMOUNT, 2) if mileage > 0 else EXTRA_AMOUNT

    from_loc = waypoints[0]["label"]
    to_summary = " → ".join(w["label"] for w in waypoints[1:]) if len(waypoints) > 1 else from_loc

    # Find or create the auto trip for this employee+date
    existing = db.query(TravelTrip).filter(
        TravelTrip.employee_id == emp_id,
        TravelTrip.trip_date == d,
        TravelTrip.trip_type == "auto",
    ).first()

    if existing:
        # Only update if still pending (don't override approved/rejected)
        if existing.status == "pending":
            existing.distance_km = total_km
            existing.amount = calculated
            existing.calculated_amount = calculated
            existing.route_legs = json.dumps(legs_result)
            existing.fuel_price_used = fuel_price
            existing.mileage_used = mileage
            existing.rate_per_km_used = rate_per_km if rate_per_km and rate_per_km > 0 else None
            existing.from_location = from_loc
            existing.to_location = to_summary
            existing.start_lat = waypoints[0]["lat"]
            existing.start_lng = waypoints[0]["lng"]
            db.commit()
            db.refresh(existing)
        return _fmt(existing)
    else:
        t = TravelTrip(
            employee_id=emp_id,
            trip_date=d,
            from_location=from_loc,
            to_location=to_summary,
            transport_mode="bike",
            distance_km=total_km,
            amount=calculated,
            notes=f"Auto-calculated from {len(reports)} geotagged proof submissions",
            route_legs=json.dumps(legs_result),
            fuel_price_used=fuel_price,
            mileage_used=mileage,
            rate_per_km_used=rate_per_km if rate_per_km and rate_per_km > 0 else None,
            calculated_amount=calculated,
            start_lat=waypoints[0]["lat"],
            start_lng=waypoints[0]["lng"],
            status="pending",
            trip_type="auto",
        )
        db.add(t)
        db.commit()
        db.refresh(t)
        return _fmt(t)


# ── Backfill ─────────────────────────────────────────────────────────────────

@router.post("/backfill")
async def backfill_trips(date_from: str, date_to: str,
                         employee_id: Optional[int] = None,
                         db: Session = Depends(get_db),
                         user=Depends(require_admin_or_deskwork)):
    """Recalculate auto travel trips for every technician-day in a date range.

    Auto trips are normally created as a side effect of proof submission. That hook is
    best-effort: if it fails, the trip is simply never created and the allowance is lost
    with nothing to show it happened. Between 2026-07-29 and 2026-08-04 that is exactly what
    occurred — dozens of qualifying days produced no trip at all.

    This makes the calculation re-runnable from the proofs, which are the source of truth
    anyway. It only ever touches trips still marked pending, so an approved or rejected
    allowance is never rewritten.
    """
    from ..models.field_report import FieldReport

    try:
        d_from = date.fromisoformat(date_from)
        d_to   = date.fromisoformat(date_to)
    except ValueError:
        raise HTTPException(400, "Dates must be YYYY-MM-DD")
    if d_to < d_from:
        raise HTTPException(400, "date_to is before date_from")
    if (d_to - d_from).days > 92:
        raise HTTPException(400, "Range too wide — do at most 3 months at a time.")

    # Only the (employee, date) pairs that actually have proofs are worth trying.
    q = (db.query(FieldReport.employee_id, FieldReport.report_date)
           .filter(FieldReport.report_date >= d_from, FieldReport.report_date <= d_to)
           .distinct())
    if employee_id:
        q = q.filter(FieldReport.employee_id == employee_id)
    pairs = sorted(set(q.all()), key=lambda p: (str(p[1]), p[0]))

    created, updated, skipped, failed = 0, 0, [], []
    for emp_id, d in pairs:
        if emp_id is None or d is None:
            continue
        before = db.query(TravelTrip).filter(
            TravelTrip.employee_id == emp_id, TravelTrip.trip_date == d,
            TravelTrip.trip_type == "auto").first()
        was_there = before is not None
        was_pending = bool(before and before.status == "pending")
        try:
            res = await auto_trip_from_reports(trip_date=str(d), employee_id=emp_id,
                                               db=db, user=user)
            if isinstance(res, dict) and res.get("ok") is False:
                skipped.append({"employee_id": emp_id, "date": str(d),
                                "reason": res.get("message")})
            elif was_there:
                # An approved/rejected trip is returned untouched by auto_trip_from_reports.
                if was_pending:
                    updated += 1
                else:
                    skipped.append({"employee_id": emp_id, "date": str(d),
                                    "reason": "already approved/rejected — left alone"})
            else:
                created += 1
        except Exception as e:
            try: db.rollback()
            except Exception: pass
            failed.append({"employee_id": emp_id, "date": str(d),
                           "error": f"{type(e).__name__}: {e}"})

    return {
        "ok": True,
        "range": {"from": str(d_from), "to": str(d_to)},
        "technician_days_examined": len(pairs),
        "created": created, "updated": updated,
        "skipped": skipped, "failed": failed,
    }


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("/")
def list_trips(employee_id: int = None, mandal_id: int = None, state: str = None,
               db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(TravelTrip)
    if user.role not in ("admin", "deskwork"):
        q = q.filter(TravelTrip.employee_id == user.id)
    else:
        if employee_id:
            q = q.filter(TravelTrip.employee_id == employee_id)
        if mandal_id:
            # Trips of technicians allotted to the selected mandal
            emp_ids = [e.id for e in db.query(Employee).filter(Employee.mandal_id == mandal_id).all()]
            q = q.filter(TravelTrip.employee_id.in_(emp_ids or [-1]))
        if state:
            # Trips of technicians whose mandal is in the selected state
            mandal_ids = [m.id for m in db.query(Mandal).filter(Mandal.state == state).all()]
            emp_ids = [e.id for e in db.query(Employee).filter(Employee.mandal_id.in_(mandal_ids or [-1])).all()]
            q = q.filter(TravelTrip.employee_id.in_(emp_ids or [-1]))
    return [_fmt(t) for t in q.order_by(TravelTrip.trip_date.desc()).all()]


@router.post("/")
async def create_trip(data: TripCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    emp = db.query(Employee).filter(Employee.id == user.id).first()

    # Block if travel allowance is disabled for this technician's area (or globally hidden)
    if not _travel_enabled_for_employee(db, emp):
        raise HTTPException(403, "Travel allowance is not enabled for your area.")

    # Get fuel price
    fuel_row = db.query(FuelSettings).order_by(FuelSettings.id.desc()).first()
    fuel_price = fuel_row.fuel_price if fuel_row else 105.0

    # Save mileage to employee profile
    emp.bike_mileage = data.mileage
    if data.from_location:
        emp.home_location = data.from_location

    # Build route: start + all legs
    points = [RouteLeg(label=data.from_location, lat=data.start_lat, lng=data.start_lng)] + data.legs

    # Calculate distances via OSRM
    legs_result = []
    total_km = 0.0
    for i in range(len(points) - 1):
        a = points[i]
        b = points[i + 1]
        dist = await _osrm_distance(a.lat, a.lng, b.lat, b.lng)
        legs_result.append({
            "from": a.label,
            "to": b.label,
            "distance_km": dist,
            "school_id": b.school_id,
        })
        total_km += dist

    total_km = round(total_km, 2)

    # Calculate amount: (total_km / mileage) * fuel_price + 50
    calculated = round((total_km / data.mileage) * fuel_price + EXTRA_AMOUNT, 2) if data.mileage > 0 else EXTRA_AMOUNT

    # Build summary to_location from leg labels
    visit_names = [l.label for l in data.legs]
    to_summary = " → ".join(visit_names) if visit_names else ""

    t = TravelTrip(
        employee_id=user.id,
        trip_date=date.fromisoformat(data.trip_date),
        from_location=data.from_location,
        to_location=to_summary,
        purpose=data.purpose,
        transport_mode=data.transport_mode,
        distance_km=total_km,
        amount=calculated,
        notes=data.notes,
        route_legs=json.dumps(legs_result),
        fuel_price_used=fuel_price,
        mileage_used=data.mileage,
        calculated_amount=calculated,
        start_lat=data.start_lat,
        start_lng=data.start_lng,
        status="pending",
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _fmt(t)


@router.patch("/{tid}/approve")
def approve_trip(tid: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Not authorized")
    t = db.query(TravelTrip).filter(TravelTrip.id == tid).first()
    if not t: raise HTTPException(404, "Not found")
    t.status = "approved"
    t.approved_by = user.id
    db.commit()
    return _fmt(t)


@router.patch("/{tid}/reject")
def reject_trip(tid: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role not in ("admin", "deskwork"):
        raise HTTPException(403, "Not authorized")
    t = db.query(TravelTrip).filter(TravelTrip.id == tid).first()
    if not t: raise HTTPException(404, "Not found")
    t.status = "rejected"
    t.approved_by = user.id
    db.commit()
    return _fmt(t)


@router.delete("/{tid}")
def delete_trip(tid: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    t = db.query(TravelTrip).filter(TravelTrip.id == tid).first()
    if not t: raise HTTPException(404, "Not found")
    if user.role not in ("admin", "deskwork") and t.employee_id != user.id:
        raise HTTPException(403, "Not authorized")
    db.delete(t)
    db.commit()
    return {"ok": True}
