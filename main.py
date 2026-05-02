from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from .db_connection import Base, engine, SessionLocal
from .models import User, Assignment, Notification, AuditLog
from .auth import hash_password, verify_password, create_token
from .rbac import require_role, get_current_user
from .HH3 import generate_h3

app = FastAPI()

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.post("/register")
def register(email: str, password: str, role: str, lat: float, lng: float, db: Session = Depends(get_db)):
    h3_index = generate_h3(lat, lng)
    user = User(
        email=email,
        hashed_password=hash_password(password),
        role=role,
        lat=lat,
        lng=lng,
        h3_index=h3_index
    )
    db.add(user)
    db.commit()
    return {"message": "User created"}

@app.post("/login")
def login(email: str, password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")

    token = create_token({"id": user.id, "role": user.role})

    db.add(AuditLog(user_id=user.id, action="login"))
    db.commit()

    return {"access_token": token}

def create_notification(db: Session, user_id: int):
    db.add(Notification(message="New assignment created", user_id=user_id))
    db.commit()

@app.post("/assignments")
def create_assignment(title: str,
                      background_tasks: BackgroundTasks,
                      user=Depends(require_role("Student")),
                      db: Session = Depends(get_db)):

    assignment = Assignment(title=title, student_id=user["id"])
    db.add(assignment)
    db.commit()

    background_tasks.add_task(create_notification, db, user["id"])

    db.add(AuditLog(user_id=user["id"], action="create_assignment"))
    db.commit()

    return {"message": "Assignment created"}

@app.get("/analytics/zones")
def zone_analytics(user=Depends(require_role("Admin")), db: Session = Depends(get_db)):
    result = db.query(User.h3_index).all()
    counts = {}
    for (h3_index,) in result:
        counts[h3_index] = counts.get(h3_index, 0) + 1
    return counts

@app.get("/audit-logs")
def get_audit_logs(user=Depends(require_role("Admin")), db: Session = Depends(get_db)):
    logs = db.query(AuditLog).all()
    return logs

@app.get("/users")
def get_all_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return users