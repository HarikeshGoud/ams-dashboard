"""Run once: python seed.py — seeds mandals, employees, villages, stock items."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, engine, Base
from app import models
from app.models.mandal import Mandal
from app.models.employee import Employee
from app.models.client import Client
from app.models.school import School
from app.models.stock import StockItem
from app.services.auth_service import hash_password

Base.metadata.create_all(bind=engine)
db = SessionLocal()

# ── Mandals ─────────────────────────────────────────────────────────────────
MANDALS = [
    "Nalgonda","Miryalaguda","Suryapet","Huzurnagar","Nakrekal",
    "Kodad","Bhuvanagiri","Choutuppal","Mothkur","Ramannapeta",
    "Chandur","Alair","Yadagirigutta","Devarakonda","Thipparthi",
    "Munugode","Addakal","Chityal"
]
print("Seeding mandals...")
for name in MANDALS:
    if not db.query(Mandal).filter(Mandal.name == name).first():
        db.add(Mandal(name=name, district="Nalgonda"))
db.commit()
mandal_map = {m.name: m.id for m in db.query(Mandal).all()}

# ── Employees ────────────────────────────────────────────────────────────────
# (code, name, password, role, mandal, designation)
import re

def default_password(code):
    """EMP001 -> EMP@001  |  ADMIN01 -> ADMIN@01  |  SUP001 -> SUP@001"""
    m = re.match(r'^([A-Za-z]+)(\d+)$', code)
    if m:
        return m.group(1) + '@' + m.group(2)
    return code + '@pass'

# (code, name, role, mandal, designation)
EMPLOYEES = [
    ("ADMIN01", "Admin User",    "admin",      "Nalgonda",      "Administrator"),
    ("EMP001",  "Kamalakar",     "technician", "Nalgonda",      "Field Technician"),
    ("EMP002",  "Ravi Kumar",    "technician", "Nalgonda",      "Field Technician"),
    ("EMP003",  "Suresh Babu",   "technician", "Miryalaguda",   "Field Technician"),
    ("EMP004",  "Priya Reddy",   "technician", "Bhuvanagiri",   "Field Technician"),
    ("EMP005",  "Kiran Goud",    "technician", "Suryapet",      "Field Technician"),
    ("EMP006",  "Mahesh Rao",    "technician", "Huzurnagar",    "Field Technician"),
    ("EMP007",  "Srinivas",      "technician", "Nakrekal",      "Field Technician"),
    ("EMP008",  "Venkat Reddy",  "technician", "Kodad",         "Field Technician"),
    ("EMP009",  "Anjali Singh",  "technician", "Choutuppal",    "Field Technician"),
    ("EMP010",  "Deepak Kumar",  "technician", "Mothkur",       "Field Technician"),
    ("EMP011",  "Ramesh Goud",   "technician", "Ramannapeta",   "Field Technician"),
    ("EMP012",  "Swathi Rao",    "technician", "Chandur",       "Field Technician"),
    ("EMP013",  "Naresh Kumar",  "technician", "Alair",         "Field Technician"),
    ("EMP014",  "Lakshmi Devi",  "technician", "Yadagirigutta", "Field Technician"),
    ("EMP015",  "Praveen Kumar", "technician", "Devarakonda",   "Field Technician"),
    ("SUP001",  "Umesh Kumar",   "technician", "Nalgonda",      "Supervisor"),
    ("SUP002",  "Srikanth",      "technician", "Suryapet",      "Supervisor"),
    # Deskwork employees (office staff)
    ("DSK001",  "Prasad Reddy",  "deskwork",   "Nalgonda",      "Data Entry Operator"),
    ("DSK002",  "Kavitha Rao",   "deskwork",   "Nalgonda",      "Office Coordinator"),
    ("DSK003",  "Anil Kumar",    "deskwork",   "Nalgonda",      "Operations Executive"),
]
print("Seeding employees...")
for code, name, role, mandal, designation in EMPLOYEES:
    password = default_password(code)
    # Match by code first, then by name — never create duplicates
    existing = (db.query(Employee).filter(Employee.employee_code == code).first() or
                db.query(Employee).filter(Employee.name == name, Employee.is_active == True).first())
    if not existing:
        db.add(Employee(
            employee_code=code, name=name, role=role,
            designation=designation, mandal_id=mandal_map.get(mandal),
            password_hash=hash_password(password)
        ))
    else:
        existing.employee_code = code
        existing.password_hash = hash_password(password)
db.commit()

# ── Clients ──────────────────────────────────────────────────────────────────
CLIENTS = [
    ("Zilla Parishad Nalgonda",   "Mr. Ravi Kumar",  "9876543210"),
    ("Zilla Parishad Suryapet",   "Mr. Suresh",      "9876543211"),
    ("Govt Schools Miryalaguda",  "Ms. Priya",       "9876543212"),
    ("AP Endowments Dept",        "Mr. Sharma",      "9876543213"),  # AP Temples
]
print("Seeding clients...")
for cname, contact, phone in CLIENTS:
    if not db.query(Client).filter(Client.name == cname).first():
        db.add(Client(name=cname, contact_person=contact, phone=phone))
db.commit()
client_map = {c.name: c.id for c in db.query(Client).all()}

# ── Unit-1: 85 Villages ──────────────────────────────────────────────────────
# From: SUMMARY UNIT-1: CONSUMABLES & SPARES CONSUMED FOR VILLAGE PLANTS
# Period 21-02-2026 TO 20-05-2026 — Technician: Kamalakar
UNIT1_VILLAGES = [
    "ANKIREDDYGUDEM VILLAGE", "LINGOJIGUDEM SC COLONY", "LINGOJIGUDEM AC COLONY",
    "LINGOJIGUDEM BC COLONY", "ZILLEDCHALKA", "ANKIREDDYGUDEM HIGHWAY",
    "PANTHANGI UNIT-1", "PANTHANGI UNIT-3", "GUNDLABAVI", "THUMBAVI",
    "D. NAGARAM", "PHEEPALPAHAD", "YALLAMBAVI", "D. MALKAPURAM", "SUNKANPALLI",
    "GUNDRAMPALLI", "YEPOOR UNIT-1", "PEEREPALLY", "YEPOOR UNIT-2",
    "PANTHANGI UNIT-2", "VELIMINEDU", "DHARMOJIGUDEM", "YELLAGIRI",
    "GOKARAM UNIT-2", "GOKARAM UNIT-1", "THALLASINGARAM", "NELAPATLA",
    "NEMILIKALUVA", "PEDDA KONDUR", "CHINTHALAGUDEM", "THANGADAPALLY",
    "DAMERA", "JALUJKALUVA", "ALLAMDEVI CHERUVU", "GOLLAGUDEM",
    "AREGUDEM UNIT-1", "AREGUDEM TEMPLE UNIT-2", "AREGUDEM TANK UNIT-3",
    "AREGUDEM CIRCLE UNIT-4", "KATREVU", "CHINNAKONDUR", "S.LINGOTAM",
    "YENAGANTI THANDA", "KUNTLAGUDEM", "ALLAPURAM", "AREGUDEM UNIT-5",
    "PAHILWANAPURAM", "REDLAREPAKA", "EDULAGUDEM", "GOLIGUDEM",
    "PULIGILLA", "GOLINEPALLY (SUDDABAVIGUDEM)", "GURUNATHPALLY",
    "GOPARAJUPALLY", "MUDDAPURAM", "M.THURKAPALLY", "RAMLINGAMPALLY",
    "BHEEMANPALLY", "PILLAIPALLY", "JULUR", "JALALPUR", "JIBLKAPALLY",
    "SHIVAREDDYGUDEM", "NARAYANAGIRI", "INDIRIYALA", "DANTUR",
    "REVANPALLY", "PEDARAVULAPALLY", "KHAPRAIPALLY", "POCHAMPALLY TOWN",
    "KANUMUKULA", "BURRONIBAVI", "DESHMUKHI", "MEHAENAGAR", "ATB THANDA",
    "MUSTHYALAPALLY", "YERRAMBELLI", "BALAMPALLY", "MASUKUNTA",
    "AREA HOSPITAL", "HANMAPUR", "19TH WARD", "9TH WARD",
    "CHANDUPATLA", "BASWAPURAM",
]

# AP Temples (from AP TEMPLES TOTAL SUMMARY)
AP_TEMPLES = [
    "YADADRI TEMPLE", "VEMULAWADA TEMPLE", "GNANA SARASWATI TEMPLE BASAR",
    "BHADRACHALAM TEMPLE", "KONDAGATTU ANJANEYA TEMPLE",
    "KOTHAGUDEM TEMPLE", "DHARMAPURI TEMPLE",
]

print("Seeding villages (Unit-1)...")
nalgonda_mandal_id = mandal_map.get("Nalgonda")
client_id = client_map.get("Zilla Parishad Nalgonda")

for village_name in UNIT1_VILLAGES:
    if not db.query(School).filter(School.name == village_name).first():
        db.add(School(
            name=village_name,
            mandal_id=nalgonda_mandal_id,
            client_id=client_id,
            model="normal",
            capacity="1000 LPH",
            plant_model="RO Plant 1000 LPH",
            amc_status="active",
            is_active=True,
        ))
db.commit()

print("Seeding AP Temples...")
temple_client_id = client_map.get("AP Endowments Dept")
for temple_name in AP_TEMPLES:
    if not db.query(School).filter(School.name == temple_name).first():
        db.add(School(
            name=temple_name,
            mandal_id=nalgonda_mandal_id,
            client_id=temple_client_id,
            model="temple",
            capacity="1000 LPH",
            plant_model="RO Plant 1000 LPH",
            amc_status="active",
            is_active=True,
        ))
db.commit()

# ── Stock Items with Real Prices ─────────────────────────────────────────────
# From: VILLAGES PRICE SUMMARY (5TH AMC) & AP TEMPLES TOTAL SUMMARY
STOCK_ITEMS = [
    # category, name, unit, unit_cost, min_qty
    # A. CONSUMABLES
    ("Consumables", "MCF - Micron Cartridge Filter 2½×20",    "nos",  105,    50),
    ("Consumables", "JUMBO Filter (4×20)",                     "nos",  350,    10),
    ("Consumables", "Antiscalant Chemical",                    "ltrs", 210,    20),
    ("Consumables", "MCF Housing 2½×20 (with filter)",        "nos",  641,    5),
    ("Consumables", "GAC (Granular Activated Carbon)",         "nos",  189,    5),
    ("Consumables", "CTO Filter",                              "nos",  189,    5),
    ("Consumables", "Bag Filter",                              "nos",  250,    5),
    ("Consumables", "CIP Chemical (Citric Acid)",              "kgs",  158,    5),
    ("Consumables", "CIP Chemical (Caustic Soda)",             "kgs",  158,    5),
    ("Consumables", "Sand (Filter Media)",                     "kgs",  350,    5),
    ("Consumables", "Activated Carbon 900 IV",                 "kgs",  1710,   2),
    ("Consumables", "Pebbles 3/4\"",                          "kgs",  350,    5),
    # B. ATW PARTS
    ("ATW Parts",   "ATW Display",                             "nos",  855,    5),
    ("ATW Parts",   "ATW Mother Board",                        "nos",  2850,   2),
    ("ATW Parts",   "ATW Adaptor",                             "nos",  1473,   5),
    ("ATW Parts",   "ATW Battery",                             "nos",  4361,   5),
    ("ATW Parts",   "ATW Smart Cards",                         "nos",  62,     100),
    ("ATW Parts",   "ATW Buttons",                             "nos",  250,    5),
    ("ATW Parts",   "ATW RFID Reader",                         "nos",  2375,   3),
    ("ATW Parts",   "ATW Fullset",                             "nos",  35000,  1),
    ("ATW Parts",   "ATW Sticker",                             "nos",  238,    10),
    # C. PUMPS & MOTORS
    ("Pumps",       "Feed Pump 1HP (2M3/Hr 35m Head)",         "nos",  11628,  2),
    ("Pumps",       "High Pressure Pump 2HP (3M3/Hr 100m)",    "nos",  31493,  1),
    ("Pumps",       "HP Pump 2-15 LEO",                        "nos",  31493,  1),
    ("Pumps",       "Dosing Pump",                             "nos",  6175,   3),
    ("Pumps",       "Feed Pump 1HP Repair",                    "nos",  5000,   0),
    ("Pumps",       "HP Pump Repair",                          "nos",  7500,   0),
    ("Pumps",       "300 GPD Pump",                            "nos",  2143,   2),
    # D. MEMBRANES & VESSELS
    ("Membranes",   "RO Membrane 4040",                        "nos",  12825,  5),
    ("Membranes",   "RO Membrane 8040",                        "nos",  30400,  2),
    ("Membranes",   "RO Membrane (100 LPH)",                   "nos",  1643,   3),
    ("Membranes",   "Membrane End Caps 4\"",                   "nos",  1250,   5),
    ("Membranes",   "FRP Vessel",                              "nos",  8500,   2),
    # E. ELECTRICAL
    ("Electrical",  "Electrical Panel Board Smart Pro (1-1)",  "nos",  7600,   3),
    ("Electrical",  "Electrical Panel Board Smart Pro (1-3)",  "nos",  7600,   2),
    ("Electrical",  "1\" Flow Sensor",                         "nos",  1045,   3),
    ("Electrical",  "1\" Solenoid Valve (DC)",                 "nos",  2898,   3),
    ("Electrical",  "Flow Meter 0-2400",                       "nos",  1805,   2),
    ("Electrical",  "SMPS",                                    "nos",  1857,   2),
    ("Electrical",  "LPS",                                     "nos",  1425,   2),
    # F. FITTINGS & PIPES
    ("Fittings",    "UPVC Fitting Set",                        "set",  3800,   2),
    ("Fittings",    "CPVC Fitting Set",                        "set",  3800,   2),
    ("Fittings",    "Brass cum Ferrole Fitting Set",           "nos",  1140,   5),
    ("Fittings",    "MPV 25 MB",                               "nos",  1710,   3),
    ("Fittings",    "Pressure Gauge 0-7",                      "nos",  855,    5),
    ("Fittings",    "Tank Level Floaty",                       "nos",  950,    5),
    ("Fittings",    "Tank Level Pipe",                         "mtrs", 100,    10),
    ("Fittings",    "Floaty Wire",                             "mtrs", 25,     10),
    ("Fittings",    "Float Valve 1\"",                         "nos",  1500,   5),
    ("Fittings",    "SS Tank Level Pipe",                      "mtrs", 90,     10),
    ("Fittings",    "8mm Tube",                                "mtrs", 14,     10),
    ("Fittings",    "FR 800",                                  "nos",  71,     5),
    ("Fittings",    "Drain Pipe",                              "nos",  100,    10),
    ("Fittings",    "Drain Coupling",                          "nos",  250,    10),
    ("Fittings",    "Taps",                                    "nos",  450,    10),
    ("Fittings",    "HDPE Tank Cap 5000 Ltrs",                "nos",  500,    3),
]

print("Seeding stock items...")
for category, name, unit, unit_cost, min_qty in STOCK_ITEMS:
    if not db.query(StockItem).filter(StockItem.name == name).first():
        db.add(StockItem(
            name=name, category=category, unit=unit,
            unit_cost=unit_cost, min_qty=min_qty,
            office_qty=0, is_active=True
        ))
db.commit()

print(f"""
Done!
  Admin login  : name='Admin User', password='admin123'
  Villages     : {len(UNIT1_VILLAGES)} Unit-1 villages seeded
  Temples      : {len(AP_TEMPLES)} AP temples seeded
  Stock items  : {len(STOCK_ITEMS)} items with real prices seeded
  Employees    : {len(EMPLOYEES)} employees (including Kamalakar - Unit-1 technician)
""")
db.close()
