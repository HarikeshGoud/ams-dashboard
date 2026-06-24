from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class Visit(Base):
    __tablename__ = "visits"
    id                  = Column(Integer, primary_key=True, index=True)
    school_id           = Column(Integer, ForeignKey("schools.id"))
    employee_id         = Column(Integer, ForeignKey("employees.id"))
    visit_date          = Column(Date, nullable=False)
    visit_type          = Column(String(30), default="routine")
    status              = Column(String(20), default="completed")
    tds_reading         = Column(Float, nullable=True)
    ph_reading          = Column(Float, nullable=True)
    filters_used        = Column(Integer, default=0)
    plant_condition     = Column(String(20), default="working")  # working / not_working / under_repair
    not_working_reason  = Column(Text, nullable=True)
    mcf_used            = Column(Integer, default=0)   # MCF filters used this visit
    antiscalant_used    = Column(Float, default=0)     # Antiscalant litres used
    spares_used         = Column(Text, nullable=True)  # JSON list of spares consumed
    work_done           = Column(Text, nullable=True)
    remarks             = Column(Text, nullable=True)
    check_in_time       = Column(DateTime, nullable=True)
    check_out_time      = Column(DateTime, nullable=True)
    latitude            = Column(Float, nullable=True)
    longitude           = Column(Float, nullable=True)
    created_at          = Column(DateTime, default=datetime.utcnow)

    school   = relationship("School", back_populates="visits")
    employee = relationship("Employee", back_populates="visits")
