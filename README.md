# Ulife

Student life dashboard with a static frontend and a FastAPI backend.

## Run Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export ULIFE_SECRET_KEY="replace-with-a-long-random-secret"
uvicorn Ulife_BACKS.main:app --reload
```

Then open:

```text
http://127.0.0.1:8000/frontend/index.html
```

## Notes

- Register and login use SDU email addresses ending with `@sdu.edu.kz`.
- The API runs on `http://127.0.0.1:8000`.
- SQLite database is stored at `backend/ulife.db`.

## Production Deploy

Required environment variables:

```text
ULIFE_SECRET_KEY=<long random secret>
ULIFE_CORS_ORIGINS=https://your-domain.example
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
```

Docker build/run:

```bash
docker build -t ulife .
docker run -p 8000:8000 \
  -e ULIFE_SECRET_KEY="replace-with-a-long-random-secret" \
  -e ULIFE_CORS_ORIGINS="http://127.0.0.1:8000" \
  ulife
```

### 1. Project Title

**Ulife – Smart University Student Productivity and Management System**

---

### 2. Topic Area

Education Technology (EdTech) / Student Productivity System / Academic Management Platform

---

### 3. Problem Statement

University students often struggle to manage multiple aspects of academic life in one place, such as schedules, assignments, finances, and personal productivity.

Most existing tools are fragmented and do not provide a unified system tailored for students.

This leads to poor organization, missed deadlines, and inefficient time management.

There is a need for an all-in-one platform that integrates academic tracking, finance management, and personal productivity tools.

---

### 4. Proposed Solution

Ulife is a web-based student management system that centralizes academic and personal productivity tools into one platform.

It provides features such as:

* Schedule and calendar tracking
* Assignment and course management
* Finance tracking for student expenses
* GPA and academic monitoring
* Mood and wellbeing tracking

The system uses a full-stack architecture with real-time data handling and user authentication.

---

### 5. Target Users

* University students
* Academic advisors 
* Educational institutions 

---

### 6. Technology Stack

**Frontend:**
HTML, CSS, JavaScript

**Backend:**
FastAPI (Python)

**Database:**
Supabase (PostgreSQL)

**Cloud / Hosting:**
Supabase Cloud (Database) + Local/Planned deployment server

**APIs / Integrations:**
REST API (FastAPI endpoints)

**Other Tools:**

* SQLAlchemy (ORM)
* Lucide Icons (UI icons)
* H3 Geospatial Indexing (analytics module)

---

### 7. Key Features

* User authentication (Login/Register with JWT)
* Academic dashboard (courses, GPA, assignments)
* Interactive calendar with events and deadlines
* Finance tracking system (income, expenses, budget)
* Mood tracking and wellbeing monitoring
* Profile management system

---

### 8. Team Members 

* 230103316 Zhanaliyeva Meruyert – Backend Developer
* 230103165 Yessetov Dias – Backend Developer
* 230103125 Amantayeva Gulnur – Frontend Developer
* 230103234 Abdulla Yerlanuly – Frontend Developer

---

### 9. Expected Outcome

A fully functional web-based student productivity platform that allows users to manage academic and personal tasks in one unified system, with a deployed backend and working frontend connected to a cloud database

---

### 10. Git Repo Link (GitHub/GitLab)

URL: https://github.com/abdulla-erlanuly111/ULife.git
