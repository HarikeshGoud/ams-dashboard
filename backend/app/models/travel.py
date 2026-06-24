from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class TravelTrip(Base):
    __tablename__ = "travel_trips"
    id             = Column(Integer, primary_key=True, index=True)
    employee_id    = Column(Integer, ForeignKey("employees.id"))
    trip_date      = Column(Date, nullable=False)
    from_location  = Column(String(200))
    to_location    = Column(String(200))
    purpose        = Column(String(300), nullable=True)
    distance_km    = Column(Numeric(8, 2), nullable=True)
    transport_mode = Column(String(20), default="bike")
    amount         = Column(Numeric(10, 2), default=0)
    status         = Column(String(20), default="pending")
    approved_by    = Column(Integer, ForeignKey("employees.id"), nullable=True)
    receipt_photo  = Column(String(255), nullable=True)
    notes          = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="travel_trips", foreign_keys=[employee_id])
