import os
from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader
from jose import jwt, JWTError

SECRET_KEY = os.getenv("ULIFE_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("ULIFE_SECRET_KEY environment variable is required")
ALGORITHM = "HS256"


oauth2_scheme = APIKeyHeader(name="Authorization")


def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        if token.startswith("Bearer "):
            token = token.replace("Bearer ", "")

        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )


def require_role(required_role: str):
    def role_checker(user=Depends(get_current_user)):
        if user.get("role", "").lower() != required_role.lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Insufficient permissions"
            )
        return user

    return role_checker
