import requests

# First login as EMP002
r = requests.post("http://localhost:8000/api/auth/login", json={"employee_code": "EMP002", "password": "EMP@002"})
print("Login:", r.status_code, r.json())
token = r.json().get("access_token")

# Test my-tasks
r2 = requests.get("http://localhost:8000/api/tasks/my-tasks", headers={"Authorization": f"Bearer {token}"})
print("my-tasks:", r2.status_code, r2.json())

# Test field-reports
r3 = requests.get("http://localhost:8000/api/field-reports/", headers={"Authorization": f"Bearer {token}"})
print("field-reports:", r3.status_code, r3.text[:300])
