from parking_auth_utils import require_auth
from parking_database_utils import execute, fetch_one
from parking_shared_utils import error_response, get_http_method, get_path, parse_json_body, success_response


def lambda_handler(event, context):
    try:
        method, path = get_http_method(event), get_path(event).rstrip("/")
        if method == "OPTIONS":
            return success_response(None, "OK")
        claims = require_auth(event)
        user_id = int(claims["sub"])

        if method == "GET" and path.endswith("/users/me"):
            user = fetch_one("SELECT id, name, email, role, phone, created_at FROM users WHERE id = %s AND is_active = 1", (user_id,))
            return success_response(user) if user else error_response("Usuario no encontrado", 404)

        if method in {"PUT", "PATCH"} and path.endswith("/users/me"):
            data = parse_json_body(event)
            allowed = {"name": "name", "phone": "phone"}
            fields, values = [], []
            for key, column in allowed.items():
                if key in data:
                    fields.append(f"{column} = %s")
                    values.append(data[key])
            if not fields:
                raise ValueError("No se enviaron campos válidos para actualizar")
            values.append(user_id)
            execute(f"UPDATE users SET {', '.join(fields)}, updated_at = SYSUTCDATETIME() WHERE id = %s", values)
            user = fetch_one("SELECT id, name, email, role, phone, created_at FROM users WHERE id = %s", (user_id,))
            return success_response(user, "Perfil actualizado")

        return error_response("Ruta no encontrada", 404)
    except PermissionError as exc:
        return error_response(str(exc), 401)
    except ValueError as exc:
        return error_response(str(exc), 400)
    except Exception as exc:
        return error_response("Error interno del servidor", 500, str(exc))
