from sqlalchemy import (Column, Integer, String, Date, DateTime, Numeric, ForeignKey,
                        UniqueConstraint)
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class ProofItemUsage(Base):
    """One row per item used on one visit: what was fitted, and how many.

    This exists because the quantity was being collected and then thrown away. The proof form
    asks for a quantity per item, but the only place it was ever written was a stock 'install'
    ledger row — and that call is skipped unless the technician happens to be holding that item
    with a batch selected. No stock has ever been distributed, so the branch never ran: the
    ledger holds zero installs and every quantity a technician has typed is gone.

    The consumption summary needs quantities per item per site per period, so it needs a record
    that exists whether or not stock tracking is being used. Stock deduction stays exactly as it
    was; this is the consumption fact, kept separately from the inventory movement.

    school_id and usage_date are copied rather than read through field_report_id every time: the
    report filters and groups on them constantly, and a usage row should still be meaningful if
    its proof is ever removed.
    """
    __tablename__ = "proof_item_usage"

    id              = Column(Integer, primary_key=True, index=True)
    field_report_id = Column(Integer, ForeignKey("field_reports.id"), nullable=True, index=True)
    school_id       = Column(Integer, ForeignKey("schools.id"), nullable=True, index=True)
    employee_id     = Column(Integer, ForeignKey("employees.id"), nullable=True)
    item_id         = Column(Integer, ForeignKey("stock_items.id"), nullable=False, index=True)
    # Not an Integer: antiscalant is dosed in litres and the sheet carries 123.75 of it.
    quantity        = Column(Numeric(12, 2), nullable=False, default=0)
    usage_date      = Column(Date, nullable=False, index=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

    item   = relationship("StockItem", foreign_keys=[item_id], lazy="joined")
    school = relationship("School",    foreign_keys=[school_id], lazy="joined")


class ClientItemRate(Base):
    """What a client is billed per unit of an item — not what it cost to buy.

    StockItem.unit_cost is the purchase price and has to stay that, or margin disappears from
    the books. The rate charged differs by client, so it lives here, keyed by both.

    A missing row means no rate has been agreed for that client and item yet. The report shows
    such rows with a blank rate rather than falling back to unit_cost, because quietly billing a
    customer at cost price is a worse failure than an obvious gap.
    """
    __tablename__ = "client_item_rates"

    id         = Column(Integer, primary_key=True, index=True)
    client_id  = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    item_id    = Column(Integer, ForeignKey("stock_items.id"), nullable=False, index=True)
    rate       = Column(Numeric(12, 2), nullable=False, default=0)
    # Default GST for this client's items; the operator can still override per report.
    gst_percent = Column(Numeric(5, 2), nullable=True)
    updated_by = Column(Integer, ForeignKey("employees.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    item   = relationship("StockItem", foreign_keys=[item_id], lazy="joined")

    __table_args__ = (
        UniqueConstraint("client_id", "item_id", name="uq_client_item_rate"),
    )
