from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..models.employee import Employee
from ..services.auth_service import create_access_token, verify_password, hash_password
from ..dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginRequest(BaseModel):
    employee_code: str
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    employee_id: int
    employee_code: str
    name: str
    role: str
    designation: str = ""

@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    emp = db.query(Employee).filter(
        Employee.employee_code == req.employee_code.upper(),
        Employee.is_active == True
    ).first()
    if not emp or not emp.password_hash:
        raise HTTPException(status_code=401, detail="Invalid Employee ID or password")
    if not verify_password(req.password, emp.password_hash):
        raise HTTPException(status_code=401, detail="Invalid Employee ID or password")
    token = create_access_token({"sub": str(emp.id), "role": emp.role})
    return TokenResponse(
        access_token=token,
        employee_id=emp.id,
        employee_code=emp.employee_code,
        name=emp.name,
        role=emp.role,
        designation=emp.designation or ""
    )

@router.post("/change-password")
def change_password(req: ChangePasswordRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    emp = db.query(Employee).filter(Employee.id == user.id).first()
    if not emp:
        raise HTTPException(404, "Employee not found")
    if not verify_password(req.current_password, emp.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    if len(req.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    emp.password_hash = hash_password(req.new_password)
    db.commit()
    return {"message": "Password changed successfully"}

@router.post("/admin-reset-password/{emp_id}")
def admin_reset_password(emp_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(404, "Employee not found")
    import re
    m = re.match(r'^([A-Za-z]+)(\d+)$', emp.employee_code or "")
    default_pw = (m.group(1) + "@" + m.group(2)) if m else (emp.employee_code + "@pass")
    emp.password_hash = hash_password(default_pw)
    db.commit()
    return {"message": f"Password reset to default: {default_pw}"}
