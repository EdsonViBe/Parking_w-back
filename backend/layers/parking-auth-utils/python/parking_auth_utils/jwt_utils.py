import os
from datetime import datetime, timedelta, timezone
from typing import Iterable

import jwt


def _secret() -> str:
    value = os.getenv("JWT_SECRET")
    if not value:
        raise RuntimeError("Falta la variable de entorno JWT_SECRET")
    return value


def create_access_token(user_id: int, email: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    minutes = int(os.getenv("JWT_EXPIRES_MINUTES", "120"))
    payload = {
        "sub": str(user_id), "email": email, "role": role,
        "iat": now, "exp": now + timedelta(minutes=minutes),
        "iss": os.getenv("JWT_ISSUER", "parking-api"),
    }
    return jwt.encode(payload, _secret(), algorithm="HS256")


def decode_access_token(token: str) -> dict:
    return jwt.decode(
        token, _secret(), algorithms=["HS256"],
        issuer=os.getenv("JWT_ISSUER", "parking-api"),
    )


def get_bearer_token(event: dict) -> str:
    headers = {str(k).lower(): v for k, v in (event.get("headers") or {}).items()}
    authorization = headers.get("authorization", "")
    if not authorization.lower().startswith("bearer "):
        raise PermissionError("Token de autorización no proporcionado")
    return authorization.split(" ", 1)[1].strip()


def require_auth(event: dict) -> dict:
    try:
        return decode_access_token(get_bearer_token(event))
    except jwt.ExpiredSignatureError as exc:
        raise PermissionError("El token ha expirado") from exc
    except jwt.InvalidTokenError as exc:
        raise PermissionError("Token inválido") from exc


def require_role(claims: dict, allowed_roles: Iterable[str]) -> None:
    if claims.get("role") not in set(allowed_roles):
        raise PermissionError("No tiene permisos para realizar esta operación")
