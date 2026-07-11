from datetime import datetime
from decimal import Decimal
from parking_auth_utils import require_auth
from parking_database_utils import connection, execute, fetch_all, fetch_one
from parking_shared_utils import error_response, get_http_method, get_path, get_path_parameter, parse_json_body, require_fields, success_response


def _parse_datetime(value: str, field: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} debe tener formato ISO 8601") from exc


def lambda_handler(event, context):
    try:
        method, path = get_http_method(event), get_path(event).rstrip("/")
        if method == "OPTIONS":
            return success_response(None, "OK")
        claims = require_auth(event)
        user_id, role = int(claims["sub"]), claims.get("role")
        reservation_id = get_path_parameter(event, "id")

        if method == "GET" and not reservation_id:
            if role == "owner":
                rows = fetch_all("""SELECT r.*, p.title AS parking_title FROM reservations r
                                  JOIN parkings p ON p.id = r.parking_id WHERE p.owner_id = %s ORDER BY r.created_at DESC""", (user_id,))
            else:
                rows = fetch_all("""SELECT r.*, p.title AS parking_title FROM reservations r
                                  JOIN parkings p ON p.id = r.parking_id WHERE r.user_id = %s ORDER BY r.created_at DESC""", (user_id,))
            return success_response(rows)

        if method == "POST":
            if role != "driver":
                return error_response("Solo un conductor puede crear reservas", 403)
            data = parse_json_body(event)
            require_fields(data, ["parking_id", "start_time", "end_time"])
            start, end = _parse_datetime(data["start_time"], "start_time"), _parse_datetime(data["end_time"], "end_time")
            if end <= start:
                raise ValueError("end_time debe ser posterior a start_time")
            parking_id = int(data["parking_id"])
            with connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute("SELECT id, price_per_hour, available_spots FROM parkings WITH (UPDLOCK, ROWLOCK) WHERE id = %s AND is_active = 1", (parking_id,))
                    parking = cursor.fetchone()
                    if not parking:
                        return error_response("Estacionamiento no encontrado", 404)
                    if parking["available_spots"] <= 0:
                        return error_response("No hay espacios disponibles", 409)
                    hours = Decimal(str((end - start).total_seconds() / 3600))
                    total = (hours * Decimal(str(parking["price_per_hour"]))).quantize(Decimal("0.01"))
                    cursor.execute("""INSERT INTO reservations (user_id, parking_id, start_time, end_time, total_amount, status)
                                      VALUES (%s,%s,%s,%s,%s,'pending'); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id""",
                                   (user_id, parking_id, start, end, total))
                    new_id = int(cursor.fetchone()["id"])
                    cursor.execute("UPDATE parkings SET available_spots = available_spots - 1 WHERE id = %s", (parking_id,))
            return success_response(fetch_one("SELECT * FROM reservations WHERE id = %s", (new_id,)), "Reserva creada", 201)

        if reservation_id and method in {"PUT", "PATCH"}:
            data = parse_json_body(event)
            new_status = str(data.get("status", "")).lower()
            allowed = {"pending", "confirmed", "cancelled", "completed"}
            if new_status not in allowed:
                raise ValueError("Estado de reserva inválido")
            reservation = fetch_one("""SELECT r.*, p.owner_id FROM reservations r JOIN parkings p ON p.id = r.parking_id WHERE r.id = %s""", (int(reservation_id),))
            if not reservation:
                return error_response("Reserva no encontrada", 404)
            can_update = reservation["user_id"] == user_id or (role == "owner" and reservation["owner_id"] == user_id)
            if not can_update:
                return error_response("No tiene permisos para actualizar esta reserva", 403)
            execute("UPDATE reservations SET status = %s, updated_at = SYSUTCDATETIME() WHERE id = %s", (new_status, int(reservation_id)))
            if new_status == "cancelled" and reservation["status"] != "cancelled":
                execute("UPDATE parkings SET available_spots = available_spots + 1 WHERE id = %s", (reservation["parking_id"],))
            return success_response(fetch_one("SELECT * FROM reservations WHERE id = %s", (int(reservation_id),)), "Reserva actualizada")

        return error_response("Ruta no encontrada", 404)
    except PermissionError as exc:
        return error_response(str(exc), 401)
    except ValueError as exc:
        return error_response(str(exc), 400)
    except Exception as exc:
        return error_response("Error interno del servidor", 500, str(exc))
