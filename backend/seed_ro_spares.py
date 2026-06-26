"""
Seed / upsert approved RO spare parts price list into stock_items.
Unique key: (name, category) — safe to re-run, no duplicates created.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models.stock import StockItem

CAT_A = "50/100 LPH RO Units"
CAT_B = "1000/1500/2000 LPH RO Units"

ITEMS = [
    # ── Category A ─────────────────────────────────────────────────────────────
    (CAT_A, "MCF",                                                          "Nos",  105),
    (CAT_A, "GAC",                                                          "Nos",  189),
    (CAT_A, "CTO",                                                          "Nos",  189),
    (CAT_A, "RO Membrane",                                                  "Nos", 1643),
    (CAT_A, "Membrane Housing",                                             "Nos",  214),
    (CAT_A, "Solinoid Valve",                                               "Nos",  200),
    (CAT_A, "Controller indicators",                                        "Nos",  214),
    (CAT_A, "TDS Control valve",                                            "Nos",  114),
    (CAT_A, "SMPS",                                                         "Nos", 1857),
    (CAT_A, "Adaptor 6 AMPS",                                               "Nos",  786),
    (CAT_A, "Low pressure switch",                                          "Nos",   96),
    (CAT_A, "UV Lamp set",                                                  "Nos",  757),
    (CAT_A, "Floaty",                                                       "Nos",   71),
    (CAT_A, "UF Membrane",                                                  "Nos",  357),
    (CAT_A, "300 GPD Pump",                                                 "Nos", 2143),
    (CAT_A, "FR 800",                                                       "Nos",   71),
    (CAT_A, "6mm tube",                                                     "Nos",    8),
    (CAT_A, "8mm tube",                                                     "Nos",   14),
    (CAT_A, "SS 304 Taps",                                                  "Nos",  257),
    (CAT_A, "System bottom plates",                                         "Nos",  571),
    (CAT_A, "0.5 HP Pump",                                                  "Nos", 3143),
    (CAT_A, "MCF Cap",                                                      "Nos",  286),
    (CAT_A, "Ferole Fittings",                                              "Nos",  214),
    (CAT_A, "HDPE Tank 500 Ltrs",                                           "Nos", 3064),
    (CAT_A, "HDPE Tank Covers",                                             "Nos",  154),
    (CAT_A, "CPVC Pipes & Fittings for re-erection of Plumbing",           "Nos", 5500),
    (CAT_A, "Plumbing Charges",                                             "Nos", 2000),
    (CAT_A, "100 LPH RO cum Chiller - Gas filling & Compressor repair",    "Nos", 6500),
    (CAT_A, "Printed Vinyl Stickers for 50 & 100 LPH RO unit with fixing", "Nos", 1400),
    (CAT_A, "RO Plant Bottom wheels",                                       "Nos",  500),

    # ── Category B ─────────────────────────────────────────────────────────────
    (CAT_B, "MCF (Micron filters)",                                                             "Nos",   105),
    (CAT_B, "Micron cartridge filter 2½x20",                                                    "Nos",   105),
    (CAT_B, "Micron cartridge jumbo filter (4x20)",                                             "Nos",   350),
    (CAT_B, "Anti scalant",                                                                     "Ltrs",  210),
    (CAT_B, "Micron cartridge filter With Housing 2½x20",                                       "Nos",   641),
    (CAT_B, '1" Flow sensor',                                                                   "Nos",  1045),
    (CAT_B, '1" Solinoid Valve (DC)',                                                           "Nos",  2898),
    (CAT_B, "ATW Sticker",                                                                      "Nos",   238),
    (CAT_B, "ATW Display",                                                                      "Nos",   855),
    (CAT_B, "ATW Mother Board",                                                                 "Nos",  2850),
    (CAT_B, "ATW Adaptor",                                                                      "Nos",  1473),
    (CAT_B, "ATW Battery",                                                                      "Nos",  4361),
    (CAT_B, "ATW Smart Cards",                                                                  "Nos",    62),
    (CAT_B, "ATW Guard",                                                                        "Nos",   600),
    (CAT_B, "ATW Buttons",                                                                      "Nos",   250),
    (CAT_B, "ATW RFID Reader",                                                                  "Nos",  2375),
    (CAT_B, "ATW Fullset",                                                                      "Nos", 35000),
    (CAT_B, "ATW Controller",                                                                   "Nos",   500),
    (CAT_B, "Jumbo Filters",                                                                    "Nos",   350),
    (CAT_B, "Antiscalant chemical",                                                             "Ltrs",  210),
    (CAT_B, "Citric acid (CIP chemical)",                                                       "Nos",  3325),
    (CAT_B, "Taps",                                                                             "Nos",   450),
    (CAT_B, "Drain pipes",                                                                      "Nos",   100),
    (CAT_B, "Drain Couplings",                                                                  "Nos",   250),
    (CAT_B, "Bag filter",                                                                       "Nos",   250),
    (CAT_B, '1" Solinoid Valve',                                                                "Nos",  2898),
    (CAT_B, "Flow meter",                                                                       "Nos",  1805),
    (CAT_B, "Brass cum feroel fitting set with blue tube (SS 304 & brass valve)",               "Nos",  1140),
    (CAT_B, "CPVC Fittings Set",                                                                "Nos",  3800),
    (CAT_B, "Dosing Pump",                                                                      "Nos",  6175),
    (CAT_B, "Electrical panel board Smart PRO Panel Board (1-3)",                               "Nos",  7600),
    (CAT_B, "Membrane Housing End caps 4\"",                                                    "Nos",  1250),
    (CAT_B, "Pressure Gauge 0-21",                                                              "Nos",   855),
    (CAT_B, "RO Membranes 4040",                                                                "Nos", 12825),
    (CAT_B, "HP Pump 2HP (3 M3/Hr, 100 Mtrs Head)",                                            "Nos", 31493),
    (CAT_B, "Feed Pump 1 HP (2M/HR, 35 Mtrs Head)",                                            "Nos", 11628),
    (CAT_B, "Tank level Floaties",                                                              "Nos",   950),
    (CAT_B, "Activated Carbon 900 IV",                                                          "Kgs",  1710),
    (CAT_B, "Pebbles 3/4\" size",                                                               "Kgs",   350),
    (CAT_B, "Fine sand",                                                                        "Kgs",   350),
    (CAT_B, "Blue pipe (6mm) gauges to plant components",                                       "Mtrs",   40),
    (CAT_B, "SS Tank Level Pipe",                                                               "Mtrs",   95),
    (CAT_B, "1.5 sq 3 core cable",                                                             "Mtrs",   15),
    (CAT_B, "Tank cap",                                                                         "Nos",   154),
    (CAT_B, "FRP Vessel",                                                                       "Nos",  8500),
    (CAT_B, "MPV25NB",                                                                          "Nos",  1710),
    (CAT_B, "3/4 Union",                                                                        "Nos",   100),
    (CAT_B, "HDPE 3000 Ltrs Tank",                                                              "Nos", 19950),
    (CAT_B, "SS 304 sinks stickers",                                                            "Nos",   150),
    (CAT_B, "Feed pump repair",                                                                 "Nos",  5000),
    (CAT_B, "HP Pump repair",                                                                   "Nos",  7500),
    (CAT_B, "Teflon Tapes",                                                                     "Nos",   100),
    (CAT_B, "Insulation Tapes",                                                                 "Nos",    30),
    (CAT_B, "TDS Meter",                                                                        "Nos",   100),
    (CAT_B, "Flooty wire",                                                                      "Nos",    25),
    (CAT_B, "LPS",                                                                              "Nos",  1425),
]

def run():
    db = SessionLocal()
    inserted = updated = 0
    try:
        for (category, name, unit, price) in ITEMS:
            existing = db.query(StockItem).filter(
                StockItem.name == name,
                StockItem.category == category
            ).first()
            if existing:
                existing.unit      = unit
                existing.unit_cost = price
                existing.is_active = True
                updated += 1
            else:
                db.add(StockItem(
                    name=name, category=category, unit=unit,
                    unit_cost=price, office_qty=0, min_qty=0, is_active=True
                ))
                inserted += 1
        db.commit()
        print(f"✅ Done — inserted: {inserted}, updated: {updated}, total processed: {len(ITEMS)}")

        # Verify counts per category
        for cat in [CAT_A, CAT_B]:
            count = db.query(StockItem).filter(StockItem.category == cat).count()
            print(f"   {cat}: {count} items")

        total = db.query(StockItem).filter(
            StockItem.category.in_([CAT_A, CAT_B])
        ).count()
        print(f"   Grand total (A+B): {total}")

    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run()
