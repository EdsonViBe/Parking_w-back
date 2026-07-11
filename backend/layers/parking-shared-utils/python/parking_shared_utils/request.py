import base64
import json
from typing import Any


def get_http_method(event: dict) -> str:
    return (event.get("requestContext", {}).get("http", {}).get("method")
            or event.get("httpMethod")
            or "GET").upper()


def get_path(event: dict) -> str:
    return event.get("rawPath") or event.get("path") or "/"


def get_path_parameter(event: dict, name: str, default=None):
    return (event.get("pathParameters") or {}).get(name, default)


def get_query_parameters(event: dict) -> dict[str, str]:
    return event.get("queryStringParameters") or {}


def parse_json_body(event: dict) -> dict[str, Any]:
    body = event.get("body")
    if body in (None, ""):
        return {}
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")
    if isinstance(body, dict):
        return body
    parsed = json.loads(body)
    if not isinstance(parsed, dict):
        raise ValueError("El cuerpo JSON debe ser un objeto")
    return parsed
