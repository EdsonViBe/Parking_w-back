from decimal import Decimal
from parking_auth_utils import require_auth, require_role
from parking_database_utils import execute, execute_insert, fetch_all, fetch_one
from parking_shared_utils import error_response, get_http_method, get_path, get_path_parameter, get_query_parameters, parse_decimal, parse_int, parse_json_body, require_fields, success_response


def lambda_handler(event, context):
    try:
        method, path = get_http_method(event), get_path(event).rstrip("/")
        if method == "OPTIONS":
            return success_response(None, "OK")

        parking_id = get_path_parameter(event, "id")
        if method == "GET" and parking_id:
            parking = fetch_one("SELECT * FROM parkings WHERE id = %s AND is_active = 1", (int(parking_id),))
            return success_response(parking) if parking else error_response("Estacionamiento no encontrado", 404)

        if method == "GET":
            query = get_query_parameters(event)
            district = query.get("district")
            if district:
                rows = fetch_all("SELECT * FROM parkings WHERE is_active = 1 AND district LIKE %s ORDER BY created_at DESC", (f"%{district}%",))
            else:
                rows = fetch_all("SELECT * FROM parkings WHERE is_active = 1 ORDER BY created_at DESC")
            return success_response(rows)

        claims = require_auth(event)
        require_role(claims, {"owner"})
        owner_id = int(claims["sub"])
        data = parse_json_body(event)

        if method == "POST":
            require_fields(data, ["title", "address", "district", "price_per_hour", "total_spots"])
            new_id = execute_insert(
                """INSERT INTO parkings
                (owner_id, title, address, district, description, price_per_hour, total_spots, available_spots, open_time, close_time)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (owner_id, data["title"], data["address"], data["district"], data.get("description"),
                 parse_decimal(data["price_per_hour"], "price_per_hour", Decimal("0")),
                 parse_int(data["total_spots"], "total_spots", 1), parse_int(data["total_spots"], "total_spots", 1),
                 data.get("open_time"), data.get("close_time")),
            )
            return success_response(fetch_one("SELECT * FROM parkings WHERE id = %s", (new_id,)), "Estacionamiento creado", 201)

        if parking_id and method in {"PUT", "PATCH"}:
            parking = fetch_one("SELECT id FROM parkings WHERE id = %s AND owner_id = %s", (int(parking_id), owner_id))
            if not parking:
                return error_response("Estacionamiento no encontrado o sin permisos", 404)
            allowed = ["title", "address", "district", "description", "price_per_hour", "total_spots", "open_time", "close_time"]
            fields, values = [], []
            for field in allowed:
                if field in data:
                    fields.append(f"{field} = %s")
                    values.append(data[field])
            if not fields:
                raise ValueError("No se enviaron campos válidos")
            values.extend([int(parking_id), owner_id])
            execute(f"UPDATE parkings SET {', '.join(fields)}, updated_at = SYSUTCDATETIME() WHERE id = %s AND owner_id = %s", values)
            return success_response(fetch_one("SELECT * FROM parkings WHERE id = %s", (int(parking_id),)), "Estacionamiento actualizado")

        if parking_id and method == "DELETE":
            affected = execute("UPDATE parkings SET is_active = 0, updated_at = SYSUTCDATETIME() WHERE id = %s AND owner_id = %s", (int(parking_id), owner_id))
            return success_response(None, "Estacionamiento eliminado") if affected else error_response("Estacionamiento no encontrado", 404)

        return error_response("Ruta no encontrada", 404)
    except PermissionError as exc:
        return error_response(str(exc), 403)
    except ValueError as exc:
        return error_response(str(exc), 400)
    except Exception as exc:
        return error_response("Error interno del servidor", 500, str(exc))
