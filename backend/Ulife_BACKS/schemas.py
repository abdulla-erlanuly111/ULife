from typing import List, Optional
from pydantic import BaseModel, EmailStr


class CourseCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    teacher_id: Optional[int] = None

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    student_id: Optional[str] = None
    university: Optional[str] = "SDU University"
    lat: float = 0.0
    lng: float = 0.0


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    student_id: Optional[str] = None
    university: Optional[str] = None
    monthly_budget: Optional[float] = None
    avatar_url: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AssignmentCreateRequest(BaseModel):
    title: str
    course_name: Optional[str] = None
    task_type: Optional[str] = None
    deadline: Optional[str] = None
    priority: Optional[str] = "Medium"
    status: Optional[str] = "To Do"
    progress: Optional[int] = 0
    notes: Optional[str] = None


class AssignmentUpdateRequest(BaseModel):
    title: Optional[str] = None
    course_name: Optional[str] = None
    task_type: Optional[str] = None
    deadline: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    progress: Optional[int] = None
    notes: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    h3_index: Optional[str] = None

    class Config:
        from_attributes = True

class EventCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    event_date: str
    location: Optional[str] = None
    user_id: Optional[int] = None


class EventUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    event_date: Optional[str] = None
    location: Optional[str] = None


class TransactionCreateRequest(BaseModel):
    title: str
    amount: float
    category: Optional[str] = None
    user_id: Optional[int] = None


class MoodCreateRequest(BaseModel):
    mood: str
    score: int
    note: Optional[str] = None


class GpaCourseRequest(BaseModel):
    code: Optional[str] = ""
    name: Optional[str] = ""
    credits: float = 0
    grade: str = "A"


class GpaSaveRequest(BaseModel):
    semester: str = "Spring 2026"
    previous_credits: float = 0
    previous_gpa: float = 0
    courses: List[GpaCourseRequest] = []
