from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    token: str


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest) -> LoginResponse:
    if body.email == settings.coros_email and body.password == settings.coros_password:
        return LoginResponse(success=True, token="local-dashboard-session")
    raise HTTPException(status_code=401, detail="Invalid credentials")


@router.get("/status")
async def auth_status() -> dict:
    return {"configured": bool(settings.coros_email and settings.coros_password)}
