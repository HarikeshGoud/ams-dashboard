from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class ServiceReport(Base):
    __tablename__ = "service_reports"
    id                   = Column(Integer, primary_key=True, index=True)
    field_report_id      = Column(Integer, ForeignKey("field_reports.id"), nullable=True)
    task_id              = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    employee_id          = Column(Integer, ForeignKey("employees.id"))
    school_id            = Column(Integer, ForeignKey("schools.id"), nullable=True)
    report_date          = Column(Date)
    problem_description  = Column(Text, nullable=True)
    observation          = Column(Text, nullable=True)
    action_taken         = Column(Text, nullable=True)
    spare_parts          = Column(Text, nullable=True)
    tds_input            = Column(Float, nullable=True)
    tds_output           = Column(Float, nullable=True)
    voltage              = Column(Float, nullable=True)
    flow_rate            = Column(Float, nullable=True)
    technician_signature = Column(String(255), nullable=True)
    principal_signature  = Column(String(255), nullable=True)
    principal_name       = Column(String(100), nullable=True)
    pdf_path             = Column(String(255), nullable=True)
    created_at           = Column(DateTime, default=datetime.utcnow)

    school    = relationship("School", foreign_keys=[school_id], lazy="joined")
    employee  = relationship("Employee", foreign_keys=[employee_id], lazy="joined")
