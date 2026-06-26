from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class AMCReport(Base):
    __tablename__ = "amc_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_no = Column(String(50), nullable=True)
    complaint_no = Column(String(50), nullable=True)
    school_id = Column(Integer, ForeignKey("schools.id"), nullable=True)
    school_name_manual = Column(String(200), nullable=True)  # fallback if not in DB
    visit_date = Column(String(20), nullable=False)
    unit_type = Column(String(50), default="AMC")  # Warranty/Chargeable/AMC/Others

    # Problem section
    problem_reported = Column(Text, nullable=True)
    observation_action = Column(Text, nullable=True)
    spares_required = Column(Text, nullable=True)

    # Unit details / site condition
    plant_location = Column(String(200), nullable=True)
    plant_capacity = Column(String(50), nullable=True)
    design_rw_tds = Column(String(50), nullable=True)
    free_chlorine_rw = Column(String(50), nullable=True)
    hours_running = Column(String(50), nullable=True)
    membrane_condition = Column(String(20), default="OK")
    uv_lamp_condition = Column(String(20), default="OK")

    # Plant readings
    raw_water_tds = Column(String(50), nullable=True)
    product_water_tds = Column(String(50), nullable=True)
    product_water_flow_lph = Column(String(50), nullable=True)
    sensors_condition = Column(String(20), default="OK")
    pre_filter_condition = Column(String(20), default="OK")
    voltage = Column(String(50), nullable=True)
    current_amps = Column(String(50), nullable=True)

    # Spares consumed
    spares_consumed = Column(Text, nullable=True)

    # Customer
    customer_name = Column(String(200), nullable=True)
    customer_mobile = Column(String(20), nullable=True)
    customer_remarks = Column(Text, nullable=True)

    # Engineer
    service_engineer_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    service_engineer_name = Column(String(200), nullable=True)
    problem_resolved = Column(String(10), default="resolved")  # resolved / unresolved

    created_at = Column(DateTime, default=datetime.utcnow)

    school = relationship("School")
    engineer = relationship("Employee", foreign_keys=[service_engineer_id])
