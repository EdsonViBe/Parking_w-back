import json
import os
from decimal import Decimal
from datetime import date, datetime, time
from typing import Any


def _json_default(value: Any):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime, time)):
        return value.isoformat()
    
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _cors_headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": os.getenv("CORS_ORIGIN", "*"),
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,PATCH,DELETE",
    }


def json_response(status_code: int, payload: Any) -> dict:
    return {
        "statusCode": status_code,
        "headers": _cors_headers(),
        "body": json.dumps(payload, ensure_ascii=False, default=_json_default),
    }


def success_response(data: Any = None, message: str = "Operación exitosa", status_code: int = 200) -> dict:
    return json_response(status_code, {"success": True, "message": message, "data": data})


def error_response(message: str, status_code: int = 500, details: Any = None) -> dict:
    payload = {"success": False, "message": message}
    if details is not None and os.getenv("APP_ENV", "dev") != "prod":
        payload["details"] = details
    return json_response(status_code, payload)


def no_content_response() -> dict:
    return {"statusCode": 204, "headers": _cors_headers(), "body": ""}
