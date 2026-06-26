from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, Numeric, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class TravelTrip(Base):
    __tablename__ = "travel_trips"
    id                = Column(Integer, primary_key=True, index=True)
    employee_id       = Column(Integer, ForeignKey("employees.id"))
    trip_date         = Column(Date, nullable=False)
    from_location     = Column(String(200))      # start/home location
    to_location       = Column(String(200))      # kept for legacy
    purpose           = Column(String(300), nullable=True)
    distance_km       = Column(Numeric(8, 2), nullable=True)   # total distance
    transport_mode    = Column(String(20), default="bike")
    amount            = Column(Numeric(10, 2), default=0)      # final calculated amount
    status            = Column(String(20), default="pending")
    approved_by       = Column(Integer, ForeignKey("employees.id"), nullable=True)
    notes             = Column(Text, nullable=True)
    created_at        = Column(DateTime, default=datetime.utcnow)
    # New fields for smart travel
    route_legs        = Column(Text, nullable=True)   # JSON: [{from, to, distance_km, school_id}]
    fuel_price_used   = Column(Float, nullable=True)  # fuel price at submission time
    mileage_used      = Column(Float, nullable=True)  # bike mileage at submission time
    calculated_amount = Column(Float, nullable=True)  # (dist/mileage)*fuel + 50
    start_lat         = Column(Float, nullable=True)
    start_lng         = Column(Float, nullable=True)

    employee = relationship("Employee", back_populates="travel_trips", foreign_keys=[employee_id])


class FuelSettings(Base):
    __tablename__ = "fuel_settings"
    id             = Column(Integer, primary_key=True, index=True)
    fuel_price     = Column(Float, default=105.0)   # Rs per litre
    set_by         = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_at     = Column(DateTime, default=datetime.utcnow)
