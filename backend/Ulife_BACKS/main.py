from dotenv import load_dotenv
load_dotenv()
import os
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from pathlib import Path
from datetime import datetime, time

from .db_connection import Base, engine, SessionLocal
from .models import User, Assignment, Notification, AuditLog, Course, Event, Transaction, MoodEntry, GpaSetting, GpaCourse
from .auth import hash_password, verify_password, create_token
from .rbac import require_role, get_current_user
from .HH3 import generate_h3
from .schemas import (
    RegisterRequest,
    LoginRequest,
    ProfileUpdateRequest,
    AssignmentCreateRequest,
    AssignmentUpdateRequest,
    CourseCreateRequest,
    EventCreateRequest,
    EventUpdateRequest,
    TransactionCreateRequest,
    MoodCreateRequest,
    GpaSaveRequest
)

app = FastAPI(
    title="Ulife Local API",
    description="Local backend for Ulife website",
    version="1.0.0"
)
BASE_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIR = BASE_DIR / "frontend"
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ULIFE_CORS_ORIGINS",
        "http://127.0.0.1:8000,http://localhost:8000"
    ).split(",")
    if origin.strip()
]

Base.metadata.create_all(bind=engine)


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/frontend", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

@app.get("/")
def root():
    return RedirectResponse(url="/frontend/index.html")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def validate_student_id(student_id: str | None):
    if not student_id or not student_id.isdigit() or len(student_id) != 9:
        raise HTTPException(status_code=400, detail="Student ID must contain exactly 9 digits")


def validate_password_strength(password: str):
    has_upper = any(char.isupper() for char in password)
    has_lower = any(char.islower() for char in password)
    has_digit = any(char.isdigit() for char in password)
    has_special = any(not char.isalnum() for char in password)

    if len(password) < 8 or not all([has_upper, has_lower, has_digit, has_special]):
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters and include uppercase, lowercase, number, and special character"
        )


def serialize_assignment(assignment: Assignment):
    return {
        "id": assignment.id,
        "title": assignment.title,
        "course_name": assignment.course_name,
        "task_type": assignment.task_type,
        "deadline": assignment.deadline,
        "priority": assignment.priority,
        "status": assignment.status,
        "progress": assignment.progress,
        "notes": assignment.notes,
        "student_id": assignment.student_id,
        "created_at": assignment.created_at
    }


def serialize_event(event: Event):
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description,
        "event_date": event.event_date,
        "location": event.location,
        "user_id": event.user_id,
        "assignment_id": event.assignment_id,
        "created_at": event.created_at
    }


def sync_assignment_event(assignment: Assignment, db: Session):
    event = db.query(Event).filter(Event.assignment_id == assignment.id).first()

    if not assignment.deadline:
        if event:
            db.delete(event)
        return

    if not event:
        event = Event(
            title=assignment.title,
            description="Deadline",
            event_date=assignment.deadline,
            location=assignment.course_name,
            user_id=assignment.student_id,
            assignment_id=assignment.id
        )
        db.add(event)
        return

    event.title = assignment.title
    event.description = "Deadline"
    event.event_date = assignment.deadline
    event.location = assignment.course_name
    event.user_id = assignment.student_id


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "message": "Ulife backend is running"
    }


@app.post("/register")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    if not data.email.lower().endswith("@sdu.edu.kz"):
        raise HTTPException(status_code=400, detail="Please use your SDU email")

    validate_student_id(data.student_id)
    validate_password_strength(data.password)

    existing_user = db.query(User).filter(User.email == data.email).first()

    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")

    role = "Student"

    h3_index = generate_h3(data.lat, data.lng)

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        role=role,
        full_name=data.full_name,
        student_id=data.student_id,
        university=data.university,
        monthly_budget=0,
        lat=data.lat,
        lng=data.lng,
        h3_index=h3_index
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(AuditLog(user_id=user.id, action="register"))
    db.commit()
    token = create_token({
        "id": user.id,
        "role": user.role
    })
    return {
        "message": "User created",
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
        "full_name": user.full_name,
        "student_id": user.student_id,
        "university": user.university,
        "access_token": token
    }


@app.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")

    token = create_token({
        "id": user.id,
        "role": user.role
    })

    db.add(AuditLog(user_id=user.id, action="login"))
    db.commit()

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "full_name": user.full_name,
            "student_id": user.student_id,
            "university": user.university
        }
    }

@app.post("/assignments")
def create_assignment(
    data: AssignmentCreateRequest,
    user=Depends(require_role("Student")),
    db: Session = Depends(get_db)
):
    if data.progress is not None and (data.progress < 0 or data.progress > 100):
        raise HTTPException(status_code=400, detail="Progress must be between 0 and 100")

    assignment = Assignment(
        title=data.title,
        course_name=data.course_name,
        task_type=data.task_type,
        deadline=data.deadline,
        priority=data.priority,
        status=data.status or "To Do",
        progress=data.progress or 0,
        notes=data.notes,
        student_id=user["id"]
    )

    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    sync_assignment_event(assignment, db)
    db.add(AuditLog(user_id=user["id"], action="create_assignment"))
    db.commit()

    return {
        "message": "Assignment created",
        "assignment": serialize_assignment(assignment)
    }


@app.get("/analytics/zones")
def zone_analytics(
    user=Depends(require_role("Admin")),
    db: Session = Depends(get_db)
):
    result = db.query(User.h3_index).all()

    counts = {}

    for (h3_index,) in result:
        if h3_index:
            counts[h3_index] = counts.get(h3_index, 0) + 1

    return {
        "zones": counts
    }


@app.get("/audit-logs")
def get_audit_logs(
    user=Depends(require_role("Admin")),
    db: Session = Depends(get_db)
):
    logs = db.query(AuditLog).all()

    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "action": log.action
        }
        for log in logs
    ]


@app.get("/users")
def get_all_users(
    user=Depends(require_role("Admin")),
    db: Session = Depends(get_db)
):
    users = db.query(User).all()

    return [
        {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "full_name": user.full_name,
            "student_id": user.student_id,
            "university": user.university,
            "lat": user.lat,
            "lng": user.lng,
            "h3_index": user.h3_index
        }
        for user in users
    ]

@app.get("/profile")
def get_profile(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    current_user = db.query(User).filter(User.id == user["id"]).first()

    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
        "full_name": current_user.full_name,
        "student_id": current_user.student_id,
        "university": current_user.university,
        "monthly_budget": current_user.monthly_budget or 0,
        "avatar_url": current_user.avatar_url,
        "lat": current_user.lat,
        "lng": current_user.lng,
        "h3_index": current_user.h3_index
    }


@app.put("/profile")
def update_profile(
    data: ProfileUpdateRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    current_user = db.query(User).filter(User.id == user["id"]).first()

    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.full_name is not None:
        current_user.full_name = data.full_name
    if data.student_id is not None:
        validate_student_id(data.student_id)
        current_user.student_id = data.student_id
    if data.university is not None:
        current_user.university = data.university
    if data.monthly_budget is not None:
        if data.monthly_budget <= 0:
            raise HTTPException(status_code=400, detail="Monthly budget must be greater than 0")
        current_user.monthly_budget = data.monthly_budget
    if data.avatar_url is not None:
        if data.avatar_url and not data.avatar_url.startswith("data:image/"):
            raise HTTPException(status_code=400, detail="Avatar must be an image data URL")
        current_user.avatar_url = data.avatar_url

    db.add(AuditLog(user_id=user["id"], action="update_profile"))
    db.commit()
    db.refresh(current_user)

    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
        "full_name": current_user.full_name,
        "student_id": current_user.student_id,
        "university": current_user.university,
        "monthly_budget": current_user.monthly_budget or 0,
        "avatar_url": current_user.avatar_url,
        "lat": current_user.lat,
        "lng": current_user.lng,
        "h3_index": current_user.h3_index
    }


@app.get("/courses")
def get_courses(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    courses = db.query(Course).all()

    return [
        {
            "id": course.id,
            "title": course.title,
            "description": course.description,
            "teacher_id": course.teacher_id
        }
        for course in courses
    ]


@app.post("/courses")
def create_course(
    data: CourseCreateRequest,
    user=Depends(require_role("Admin")),
    db: Session = Depends(get_db)
):
    course = Course(
        title=data.title,
        description=data.description,
        teacher_id=data.teacher_id
    )

    db.add(course)
    db.commit()
    db.refresh(course)

    db.add(AuditLog(user_id=user["id"], action="create_course"))
    db.commit()

    return {
        "message": "Course created",
        "course": {
            "id": course.id,
            "title": course.title,
            "description": course.description,
            "teacher_id": course.teacher_id
        }
    }


@app.get("/assignments")
def get_assignments(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user["role"].lower() == "admin":
        assignments = db.query(Assignment).all()
    else:
        assignments = db.query(Assignment).filter(
            Assignment.student_id == user["id"]
        ).all()

    return [
        serialize_assignment(assignment)
        for assignment in assignments
    ]


@app.put("/assignments/{assignment_id}")
def update_assignment(
    assignment_id: int,
    data: AssignmentUpdateRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if user["role"].lower() != "admin" and assignment.student_id != user["id"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if data.progress is not None and (data.progress < 0 or data.progress > 100):
        raise HTTPException(status_code=400, detail="Progress must be between 0 and 100")

    update_fields = [
        "title",
        "course_name",
        "task_type",
        "deadline",
        "priority",
        "status",
        "progress",
        "notes"
    ]
    for field in update_fields:
        value = getattr(data, field)
        if value is not None:
            setattr(assignment, field, value)

    sync_assignment_event(assignment, db)
    db.add(AuditLog(user_id=user["id"], action="update_assignment"))
    db.commit()
    db.refresh(assignment)

    return {
        "message": "Assignment updated",
        "assignment": serialize_assignment(assignment)
    }


@app.delete("/assignments/{assignment_id}")
def delete_assignment(
    assignment_id: int,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if user["role"].lower() != "admin" and assignment.student_id != user["id"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    linked_event = db.query(Event).filter(Event.assignment_id == assignment.id).first()
    if linked_event:
        db.delete(linked_event)

    db.delete(assignment)
    db.add(AuditLog(user_id=user["id"], action="delete_assignment"))
    db.commit()

    return {
        "message": "Assignment deleted"
    }


@app.get("/notifications")
def get_notifications(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    notifications = db.query(Notification).filter(
        Notification.user_id == user["id"]
    ).all()

    return [
        {
            "id": notification.id,
            "message": notification.message,
            "user_id": notification.user_id,
            "is_read": notification.is_read
        }
        for notification in notifications
    ]


@app.put("/notifications/read")
def mark_notifications_as_read(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    notifications = db.query(Notification).filter(
        Notification.user_id == user["id"]
    ).all()

    for notification in notifications:
        notification.is_read = True

    db.commit()

    return {
        "message": "Notifications marked as read"
    }

@app.get("/events")
def get_events(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user["role"].lower() == "admin":
        events = db.query(Event).all()
    else:
        events = db.query(Event).filter(Event.user_id == user["id"]).all()

    return [
        serialize_event(event)
        for event in events
    ]


@app.post("/events")
def create_event(
    data: EventCreateRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    event_user_id = user["id"]

    if user["role"].lower() == "admin" and data.user_id:
        event_user_id = data.user_id

    event = Event(
        title=data.title,
        description=data.description,
        event_date=data.event_date,
        location=data.location,
        user_id=event_user_id
    )

    db.add(event)
    db.commit()
    db.refresh(event)

    db.add(AuditLog(user_id=user["id"], action="create_event"))
    db.commit()

    return {
        "message": "Event created",
        "event": serialize_event(event)
    }


@app.put("/events/{event_id}")
def update_event(
    event_id: int,
    data: EventUpdateRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    event = db.query(Event).filter(Event.id == event_id).first()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if user["role"].lower() != "admin" and event.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if data.title is not None:
        event.title = data.title

    if data.description is not None:
        event.description = data.description

    if data.event_date is not None:
        event.event_date = data.event_date

    if data.location is not None:
        event.location = data.location

    db.commit()
    db.refresh(event)

    db.add(AuditLog(user_id=user["id"], action="update_event"))
    db.commit()

    return {
        "message": "Event updated",
        "event": serialize_event(event)
    }


@app.delete("/events/{event_id}")
def delete_event(
    event_id: int,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    event = db.query(Event).filter(Event.id == event_id).first()

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if user["role"].lower() != "admin" and event.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    db.delete(event)
    db.commit()

    db.add(AuditLog(user_id=user["id"], action="delete_event"))
    db.commit()

    return {
        "message": "Event deleted"
    }

@app.get("/transactions")
def get_transactions(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user["role"].lower() == "admin":
        transactions = db.query(Transaction).all()
    else:
        transactions = db.query(Transaction).filter(
            Transaction.user_id == user["id"]
        ).all()

    return [
        {
            "id": transaction.id,
            "title": transaction.title,
            "amount": transaction.amount,
            "category": transaction.category,
            "user_id": transaction.user_id,
            "created_at": transaction.created_at
        }
        for transaction in transactions
    ]


@app.post("/transactions")
def create_transaction(
    data: TransactionCreateRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    transaction_user_id = user["id"]

    if user["role"].lower() == "admin" and data.user_id:
        transaction_user_id = data.user_id

    transaction = Transaction(
        title=data.title,
        amount=data.amount,
        category=data.category,
        user_id=transaction_user_id
    )

    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    db.add(AuditLog(user_id=user["id"], action="create_transaction"))
    db.commit()

    return {
        "message": "Transaction created",
        "transaction": {
            "id": transaction.id,
            "title": transaction.title,
            "amount": transaction.amount,
            "category": transaction.category,
            "user_id": transaction.user_id
        }
    }

DEFAULT_GPA_COURSES = []


def serialize_gpa(setting, courses):
    return {
        "semester": setting.semester,
        "previous_credits": setting.previous_credits,
        "previous_gpa": setting.previous_gpa,
        "courses": [
            {
                "id": course.id,
                "code": course.code,
                "name": course.name,
                "credits": course.credits,
                "grade": course.grade
            }
            for course in courses
        ]
    }


def ensure_gpa_data(db: Session, user_id: int):
    setting = db.query(GpaSetting).filter(GpaSetting.user_id == user_id).first()

    if not setting:
        setting = GpaSetting(
            user_id=user_id,
            semester="Spring 2026",
            previous_credits=0,
            previous_gpa=0
        )
        db.add(setting)

    courses = db.query(GpaCourse).filter(GpaCourse.user_id == user_id).all()

    if not courses:
        for course in DEFAULT_GPA_COURSES:
            db.add(GpaCourse(user_id=user_id, **course))
        db.commit()
        db.refresh(setting)
        courses = db.query(GpaCourse).filter(GpaCourse.user_id == user_id).all()
    else:
        db.commit()

    return setting, courses


@app.get("/gpa")
def get_gpa(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    setting, courses = ensure_gpa_data(db, user["id"])
    return serialize_gpa(setting, courses)


@app.put("/gpa")
def save_gpa(
    data: GpaSaveRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if data.previous_credits < 0:
        raise HTTPException(status_code=400, detail="Previous credits cannot be negative")
    if data.previous_gpa < 0 or data.previous_gpa > 4:
        raise HTTPException(status_code=400, detail="Previous GPA must be between 0 and 4")

    allowed_grades = {"A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"}
    for course in data.courses:
        if course.credits < 0:
            raise HTTPException(status_code=400, detail="Course credits cannot be negative")
        if course.grade not in allowed_grades:
            raise HTTPException(status_code=400, detail="Invalid grade")

    setting = db.query(GpaSetting).filter(GpaSetting.user_id == user["id"]).first()
    if not setting:
        setting = GpaSetting(user_id=user["id"])

    setting.semester = data.semester
    setting.previous_credits = data.previous_credits
    setting.previous_gpa = data.previous_gpa
    setting.updated_at = datetime.utcnow()
    db.add(setting)

    db.query(GpaCourse).filter(GpaCourse.user_id == user["id"]).delete()
    for course in data.courses:
        db.add(GpaCourse(
            user_id=user["id"],
            code=course.code,
            name=course.name,
            credits=course.credits,
            grade=course.grade
        ))

    db.add(AuditLog(user_id=user["id"], action="save_gpa"))
    db.commit()
    db.refresh(setting)
    courses = db.query(GpaCourse).filter(GpaCourse.user_id == user["id"]).all()

    return serialize_gpa(setting, courses)

@app.get("/mood")
def get_mood_entries(
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user["role"].lower() == "admin":
        mood_entries = db.query(MoodEntry).all()
    else:
        mood_entries = db.query(MoodEntry).filter(
            MoodEntry.user_id == user["id"]
        ).order_by(MoodEntry.created_at.asc()).all()

    return [
        {
            "id": mood.id,
            "mood": mood.mood,
            "score": mood.score,
            "note": mood.note,
            "user_id": mood.user_id,
            "created_at": mood.created_at
        }
        for mood in mood_entries
    ]


@app.post("/mood")
def create_mood_entry(
    data: MoodCreateRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if data.score < 1 or data.score > 5:
        raise HTTPException(
            status_code=400,
            detail="Mood score must be between 1 and 5"
        )

    today = datetime.utcnow().date()
    day_start = datetime.combine(today, time.min)
    day_end = datetime.combine(today, time.max)
    todays_moods = db.query(MoodEntry).filter(
        MoodEntry.user_id == user["id"],
        MoodEntry.created_at >= day_start,
        MoodEntry.created_at <= day_end
    ).order_by(MoodEntry.created_at.desc()).all()
    mood = todays_moods[0] if todays_moods else None
    action = "create_mood_entry"

    if mood:
        mood.mood = data.mood
        mood.score = data.score
        mood.note = data.note
        action = "update_mood_entry"

        for duplicate in todays_moods[1:]:
            db.delete(duplicate)
    else:
        mood = MoodEntry(
            mood=data.mood,
            score=data.score,
            note=data.note,
            user_id=user["id"]
        )

    db.add(mood)
    db.commit()
    db.refresh(mood)

    db.add(AuditLog(user_id=user["id"], action=action))
    db.commit()

    return {
        "message": "Mood entry saved",
        "mood": {
            "id": mood.id,
            "mood": mood.mood,
            "score": mood.score,
            "note": mood.note,
            "user_id": mood.user_id,
            "created_at": mood.created_at
        }
    }
