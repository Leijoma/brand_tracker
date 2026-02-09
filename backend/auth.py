import os
import httpx
from typing import Optional
from fastapi import Header, HTTPException


SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")


async def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """Extract user_id from Supabase JWT token.

    When SUPABASE_URL is not configured, returns None (dev mode, no auth).
    When configured, validates the token against Supabase Auth API.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None  # Dev mode — no auth required

    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": SUPABASE_SERVICE_KEY,
                },
            )
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

        user_data = response.json()
        user_id = user_data.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid user data")
        return user_id

    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Auth service unavailable")
