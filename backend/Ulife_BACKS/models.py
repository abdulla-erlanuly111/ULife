from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime, Float, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .db_connection import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True)
    hashed_password = Column(String)
    role = Column(String)
    full_name = Column(String)
    student_id = Column(String)
    university = Column(String)
    monthly_budget = Column(Float, default=0.0)
    avatar_url = Column(Text)
    lat = Column(Float)
    lng = Column(Float)
    h3_index = Column(String)

class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True)
    title = Column(String)
    course_name = Column(String)
    task_type = Column(String)
    deadline = Column(String)
    priority = Column(String)
    status = Column(String, default="To Do")
    progress = Column(Integer, default=0)
    notes = Column(Text)
    student_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    message = Column(String)
    user_id = Column(Integer, ForeignKey("users.id"))
    is_read = Column(Boolean, default=False)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    action = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)

class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=True)

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    event_date = Column(String, nullable=False)
    location = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    category = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class MoodEntry(Base):
    __tablename__ = "mood_entries"

    id = Column(Integer, primary_key=True, index=True)
    mood = Column(String, nullable=False)
    score = Column(Integer, nullable=False)
    note = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class GpaSetting(Base):
    __tablename__ = "gpa_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    semester = Column(String, default="Spring 2026")
    previous_credits = Column(Float, default=0)
    previous_gpa = Column(Float, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow)


class GpaCourse(Base):
    __tablename__ = "gpa_courses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    code = Column(String, nullable=True)
    name = Column(String, nullable=True)
    credits = Column(Float, default=0)
    grade = Column(String, default="A")
    created_at = Column(DateTime, default=datetime.utcnow)
