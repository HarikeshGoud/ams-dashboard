from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class Notification(Base):
    __tablename__ = "notifications"
    id           = Column(Integer, primary_key=True, index=True)
    recipient_id = Column(Integer, ForeignKey("employees.id"))   # admin user
    sender_id    = Column(Integer, ForeignKey("employees.id"), nullable=True)
    type         = Column(String(50), default="TASK_DELETED")    # TASK_DELETED, etc.
    message      = Column(Text, nullable=False)
    is_read      = Column(Boolean, default=False)
    created_at   = Column(DateTime, default=datetime.utcnow)

    recipient = relationship("Employee", foreign_keys=[recipient_id])
    sender    = relationship("Employee", foreign_keys=[sender_id])
