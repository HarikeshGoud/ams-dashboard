import json, httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
from ..database import get_db
from ..models.travel import TravelTrip, FuelSettings
from ..models.employee import Employee
from ..dependencies import get_current_user, require_admin_or_deskwork

router = APIRouter(prefix="/api/travel", tags=["travel"])

EXTRA_AMOUNT = 50  # fixed extra Rs added to every trip

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

class FuelSettingsUpdate(BaseModel):
    fuel_price: float

class MileageUpdate(BaseModel):
    bike_mileage: float
    home_location: Optional[str] = None


# ── Fuel settings ─────────────────────────────────────────────────────────────

@router.get("/fuel-settings")
def get_fuel_settings(db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(FuelSettings).order_by(FuelSettings.id.desc()).first()
    if not row:
        return {"fuel_price": 105.0, "updated_at": None}
    return {"fuel_price": row.fuel_price, "updated_at": row.updated_at.isoformat() if row.updated_at else None}


@router.post("/fuel-settings")
def set_fuel_settings(data: FuelSettingsUpdate, db: Session = Depends(get_db), user=Depends(require_admin_or_deskwork)):
    row = db.query(FuelSettings).order_by(FuelSettings.id.desc()).first()
    if row:
        row.fuel_price = data.fuel_price
        row.set_by = user.id
        row.updated_at = datetime.utcnow()
    else:
        db.add(FuelSettings(fuel_price=data.fuel_price, set_by=user.id))
    db.commit()
    return {"ok": True, "fuel_price": data.fuel_price}


# ── Mileage / home location ───────────────────────────────────────────────────

@router.patch("/my-profile")
def update_mileage(data: MileageUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    emp = db.query(Employee).filter(Employee.id == user.id).first()
    emp.bike_mileage = data.bike_mileage
    if data.home_location:
        emp.home_location = data.home_location
    db.commit()
    return {"ok": True, "bike_mileage": emp.bike_mileage, "home_location": emp.home_location}


@router.get("/my-profile")
def get_my_profile(db: Session = Depends(get_db), user=Depends(get_current_user)):
    emp = db.query(Employee).filter(Employee.id == user.id).first()
    return {
        "bike_mileage": emp.bike_mileage or 45.0,
        "home_location": emp.home_location or "",
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


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("/")
def list_trips(employee_id: int = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(TravelTrip)
    if user.role not in ("admin", "deskwork"):
        q = q.filter(TravelTrip.employee_id == user.id)
    elif employee_id:
        q = q.filter(TravelTrip.employee_id == employee_id)
    return [_fmt(t) for t in q.order_by(TravelTrip.trip_date.desc()).all()]


@router.post("/")
async def create_trip(data: TripCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    # Get fuel price
    fuel_row = db.query(FuelSettings).order_by(FuelSettings.id.desc()).first()
    fuel_price = fuel_row.fuel_price if fuel_row else 105.0

    # Save mileage to employee profile
    emp = db.query(Employee).filter(Employee.id == user.id).first()
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
