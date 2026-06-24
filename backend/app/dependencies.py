from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .database import get_db
from .services.auth_service import decode_token
from .models.employee import Employee

bearer = HTTPBearer(auto_error=False)

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db)
) -> Employee:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(credentials.credentials)
        emp_id = int(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    emp = db.query(Employee).filter(Employee.id == emp_id, Employee.is_active == True).first()
    if not emp:
        raise HTTPException(status_code=401, detail="User not found")
    return emp

def require_admin(current_user: Employee = Depends(get_current_user)) -> Employee:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

def require_admin_or_deskwork(current_user: Employee = Depends(get_current_user)) -> Employee:
    if current_user.role not in ("admin", "deskwork"):
        raise HTTPException(status_code=403, detail="Admin or Deskwork access required")
    return current_user
