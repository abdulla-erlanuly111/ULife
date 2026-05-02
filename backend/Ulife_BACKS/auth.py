import os
import hashlib
import bcrypt
from jose import jwt
from datetime import datetime, timedelta

SECRET_KEY = os.getenv("ULIFE_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("ULIFE_SECRET_KEY environment variable is required")

ALGORITHM = "HS256"

def hash_password(password: str):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain_password: str, hashed_password: str):
    if hashed_password.startswith("$2"):
        return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())

    legacy_hash = hashlib.sha256(plain_password.encode()).hexdigest()
    return legacy_hash == hashed_password

def create_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=2)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
