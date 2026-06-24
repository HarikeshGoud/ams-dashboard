from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, Boolean, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class FieldReport(Base):
    __tablename__ = "field_reports"
    id               = Column(Integer, primary_key=True, index=True)
    task_id          = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    employee_id      = Column(Integer, ForeignKey("employees.id"))
    school_id        = Column(Integer, ForeignKey("schools.id"), nullable=True)
    report_date      = Column(Date)
    item_installed   = Column(String(200), nullable=True)  # filter / antiscalant / etc.
    remarks          = Column(Text, nullable=True)
    latitude         = Column(Float, nullable=True)   # GPS at submission
    longitude        = Column(Float, nullable=True)
    submitted_at          = Column(DateTime, nullable=True)
    status                = Column(String(20), default="submitted")
    verification_status   = Column(String(20), default="pending")   # pending / verified / rejected
    verification_note     = Column(Text, nullable=True)
    verified_at           = Column(DateTime, nullable=True)
    whatsapp_sent_at      = Column(DateTime, nullable=True)
    created_at            = Column(DateTime, default=datetime.utcnow)

    school = relationship("School", foreign_keys=[school_id], lazy="joined")
    work_photos = relationship("WorkProof", back_populates="field_report_ref",
                               foreign_keys="WorkProof.field_report_id",
                               cascade="all, delete-orphan")

class WorkProof(Base):
    __tablename__ = "work_proofs"
    id              = Column(Integer, primary_key=True, index=True)
    field_report_id = Column(Integer, ForeignKey("field_reports.id"), nullable=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"))
    task_id         = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    file_path       = Column(String(255))
    photo_type      = Column(String(30), default="proof")  # before / after / item / proof
    latitude        = Column(Float, nullable=True)
    longitude       = Column(Float, nullable=True)
    uploaded_at     = Column(DateTime, default=datetime.utcnow)

    field_report_ref = relationship("FieldReport", back_populates="work_photos",
                                    foreign_keys=[field_report_id])
