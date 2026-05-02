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
DATABASE_URL=<database url, optional; defaults to SQLite>
```

Docker build/run:

```bash
docker build -t ulife .
docker run -p 8000:8000 \
  -e ULIFE_SECRET_KEY="replace-with-a-long-random-secret" \
  -e ULIFE_CORS_ORIGINS="http://127.0.0.1:8000" \
  ulife
```

For public production, prefer a managed PostgreSQL database or a persistent
volume instead of committing or redeploying the local SQLite file.
