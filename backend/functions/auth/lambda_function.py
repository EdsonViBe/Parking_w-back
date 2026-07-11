from parking_auth_utils import create_access_token, hash_password, verify_password
from parking_database_utils import execute_insert, fetch_one
from parking_shared_utils import error_response, get_http_method, get_path, normalize_email, parse_json_body, require_fields, success_response


def _public_user(user: dict) -> dict:
    return {"id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"]}


def _login(data: dict) -> dict:
    require_fields(data, ["email", "password"])
    email = normalize_email(data["email"])
    user = fetch_one("SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = %s", (email,))
    if not user or not user["is_active"] or not verify_password(data["password"], user["password_hash"]):
        return error_response("Correo o contraseña incorrectos", 401)
    token = create_access_token(user["id"], user["email"], user["role"])
    return success_response({"token": token, "user": _public_user(user)}, "Inicio de sesión correcto")


def _register(data: dict) -> dict:
    require_fields(data, ["name", "email", "password", "role"])
    email = normalize_email(data["email"])
    role = str(data["role"]).lower()
    if role not in {"driver", "owner"}:
        raise ValueError("El rol debe ser driver u owner")
    if fetch_one("SELECT id FROM users WHERE email = %s", (email,)):
        return error_response("Ya existe un usuario con ese correo", 409)
    user_id = execute_insert(
        "INSERT INTO users (name, email, password_hash, role) VALUES (%s, %s, %s, %s)",
        (data["name"].strip(), email, hash_password(data["password"]), role),
    )
    user = {"id": user_id, "name": data["name"].strip(), "email": email, "role": role}
    token = create_access_token(user_id, email, role)
    return success_response({"token": token, "user": user}, "Usuario registrado", 201)


def lambda_handler(event, context):
    try:
        method, path = get_http_method(event), get_path(event).rstrip("/")
        if method == "OPTIONS":
            return success_response(None, "OK")
        data = parse_json_body(event)
        if method == "POST" and path.endswith("/auth/login"):
            return _login(data)
        if method == "POST" and path.endswith("/auth/register"):
            return _register(data)
        return error_response("Ruta no encontrada", 404)
    except ValueError as exc:
        return error_response(str(exc), 400)
    except Exception as exc:
        return error_response("Error interno del servidor", 500, str(exc))
