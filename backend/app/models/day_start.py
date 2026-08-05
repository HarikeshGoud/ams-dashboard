from sqlalchemy import (Column, Integer, String, Date, DateTime, Float, ForeignKey,
                        UniqueConstraint)
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class DayStart(Base):
    """Where a technician set off from, so the first leg of the day gets counted.

    Travel is built from the GPS on proof photos, and the first proof of the day is the first
    SITE — so the ride from home to it was never in the total. This supplies that missing
    waypoint: a photo taken before leaving, carrying the coordinate of the moment, which the
    travel calculation places ahead of the day's visits.

    Why a photo and not just the stored home address: no technician has home_lat on their
    employee record, so there is nothing to read. And this directly increases what the company
    pays out, so the coordinate needs something behind it — a live photo makes the claim
    auditable in Proof Review's own terms rather than taking a number on trust.

    One row per technician per day; tapping it again replaces the coordinate and the photo,
    since the useful reading is the one from when they actually left.
    """
    __tablename__ = "day_starts"

    id          = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    start_date  = Column(Date,    nullable=False, index=True)
    latitude    = Column(Float,   nullable=False)
    longitude   = Column(Float,   nullable=False)
    photo_path  = Column(String(255), nullable=True)
    # What to print as the first leg's origin on the trip. Usually "Home".
    label       = Column(String(120), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    employee    = relationship("Employee", foreign_keys=[employee_id], lazy="joined")

    __table_args__ = (
        UniqueConstraint("employee_id", "start_date", name="uq_day_start_employee_date"),
    )
