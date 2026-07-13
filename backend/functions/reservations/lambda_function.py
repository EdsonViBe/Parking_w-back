from datetime import datetime
from decimal import Decimal

from parking_auth_utils import require_auth
from parking_database_utils import (
    connection,
    execute,
    fetch_all,
    fetch_one
)
from parking_shared_utils import (
    error_response,
    get_http_method,
    get_path,
    get_path_parameter,
    parse_json_body,
    require_fields,
    success_response
)


ALLOWED_STATUSES = {
    "pending",
    "confirmed",
    "cancelled",
    "completed"
}

ALLOWED_VEHICLE_TYPES = {
    "car",
    "motorcycle",
    "suv",
    "bicycle"
}


def _parse_datetime(value: str, field: str) -> datetime:
    try:
        return datetime.fromisoformat(
            value.replace("Z", "+00:00")
        )
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"{field} debe tener formato ISO 8601"
        ) from exc


def _normalize_vehicle_plate(
    value: str | None
) -> str | None:
    if not value:
        return None

    plate = str(value).strip().upper()

    if len(plate) > 15:
        raise ValueError(
            "La placa no puede tener más de 15 caracteres"
        )

    return plate


def _normalize_vehicle_type(
    value: str | None
) -> str | None:
    if not value:
        return None

    vehicle_type = str(value).strip().lower()

    if vehicle_type not in ALLOWED_VEHICLE_TYPES:
        raise ValueError(
            "Tipo de vehículo inválido"
        )

    return vehicle_type


def _get_reservation(
    reservation_id: int
):
    return fetch_one(
        """
        SELECT
            r.*,
            p.title AS parking_title,
            p.address AS parking_address
        FROM reservations r
        INNER JOIN parkings p
            ON p.id = r.parking_id
        WHERE r.id = %s
        """,
        (reservation_id,)
    )


def lambda_handler(event, context):
    try:
        method = get_http_method(event)
        path = get_path(event).rstrip("/")

        if method == "OPTIONS":
            return success_response(None, "OK")

        claims = require_auth(event)

        user_id = int(claims["sub"])
        role = claims.get("role")

        reservation_id = get_path_parameter(
            event,
            "id"
        )

        # =====================================================
        # GET /reservations
        # =====================================================
        if method == "GET" and not reservation_id:
            if role == "owner":
                rows = fetch_all(
                    """
                    SELECT
                        r.*,
                        p.title AS parking_title,
                        p.address AS parking_address
                    FROM reservations r
                    INNER JOIN parkings p
                        ON p.id = r.parking_id
                    WHERE p.owner_id = %s
                    ORDER BY r.created_at DESC
                    """,
                    (user_id,)
                )
            else:
                rows = fetch_all(
                    """
                    SELECT
                        r.*,
                        p.title AS parking_title,
                        p.address AS parking_address
                    FROM reservations r
                    INNER JOIN parkings p
                        ON p.id = r.parking_id
                    WHERE r.user_id = %s
                    ORDER BY r.created_at DESC
                    """,
                    (user_id,)
                )

            return success_response(rows)

        # =====================================================
        # POST /reservations
        # =====================================================
        if method == "POST":
            if role != "driver":
                return error_response(
                    "Solo un conductor puede crear reservas",
                    403
                )

            data = parse_json_body(event)

            require_fields(
                data,
                [
                    "parking_id",
                    "start_time",
                    "end_time"
                ]
            )

            start = _parse_datetime(
                data["start_time"],
                "start_time"
            )

            end = _parse_datetime(
                data["end_time"],
                "end_time"
            )

            if end <= start:
                raise ValueError(
                    "end_time debe ser posterior a start_time"
                )

            parking_id = int(data["parking_id"])

            vehicle_plate = _normalize_vehicle_plate(
                data.get("vehicle_plate")
            )

            vehicle_type = _normalize_vehicle_type(
                data.get("vehicle_type")
            )

            with connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT
                            id,
                            price_per_hour,
                            available_spots
                        FROM parkings
                        WITH (UPDLOCK, ROWLOCK)
                        WHERE id = %s
                          AND is_active = 1
                        """,
                        (parking_id,)
                    )

                    parking = cursor.fetchone()

                    if not parking:
                        return error_response(
                            "Estacionamiento no encontrado",
                            404
                        )

                    if parking["available_spots"] <= 0:
                        return error_response(
                            "No hay espacios disponibles",
                            409
                        )

                    hours = Decimal(
                        str(
                            (end - start).total_seconds()
                            / 3600
                        )
                    )

                    total = (
                        hours
                        * Decimal(
                            str(parking["price_per_hour"])
                        )
                    ).quantize(Decimal("0.01"))

                    cursor.execute(
                        """
                        INSERT INTO reservations
                        (
                            user_id,
                            parking_id,
                            start_time,
                            end_time,
                            vehicle_plate,
                            vehicle_type,
                            total_amount,
                            status
                        )
                        VALUES
                        (
                            %s,
                            %s,
                            %s,
                            %s,
                            %s,
                            %s,
                            %s,
                            'pending'
                        );

                        SELECT
                            CAST(SCOPE_IDENTITY() AS INT)
                            AS id;
                        """,
                        (
                            user_id,
                            parking_id,
                            start,
                            end,
                            vehicle_plate,
                            vehicle_type,
                            total
                        )
                    )

                    new_id = int(
                        cursor.fetchone()["id"]
                    )

                    cursor.execute(
                        """
                        UPDATE parkings
                        SET available_spots =
                            available_spots - 1,
                            updated_at =
                            SYSUTCDATETIME()
                        WHERE id = %s
                        """,
                        (parking_id,)
                    )

            created_reservation = _get_reservation(
                new_id
            )

            return success_response(
                created_reservation,
                "Reserva creada",
                201
            )

        # =====================================================
        # PUT/PATCH /reservations/{id}
        # =====================================================
        if (
            reservation_id
            and method in {"PUT", "PATCH"}
        ):
            data = parse_json_body(event)

            new_status = str(
                data.get("status", "")
            ).strip().lower()

            if new_status not in ALLOWED_STATUSES:
                raise ValueError(
                    "Estado de reserva inválido"
                )

            reservation = fetch_one(
                """
                SELECT
                    r.*,
                    p.owner_id
                FROM reservations r
                INNER JOIN parkings p
                    ON p.id = r.parking_id
                WHERE r.id = %s
                """,
                (int(reservation_id),)
            )

            if not reservation:
                return error_response(
                    "Reserva no encontrada",
                    404
                )

            is_driver_owner = (
                reservation["user_id"] == user_id
            )

            is_parking_owner = (
                role == "owner"
                and reservation["owner_id"] == user_id
            )

            if not (
                is_driver_owner
                or is_parking_owner
            ):
                return error_response(
                    "No tiene permisos para actualizar "
                    "esta reserva",
                    403
                )

            previous_status = reservation["status"]

            execute(
                """
                UPDATE reservations
                SET
                    status = %s,
                    updated_at = SYSUTCDATETIME()
                WHERE id = %s
                """,
                (
                    new_status,
                    int(reservation_id)
                )
            )

            if (
                new_status == "cancelled"
                and previous_status != "cancelled"
            ):
                execute(
                    """
                    UPDATE parkings
                    SET
                        available_spots =
                            CASE
                                WHEN available_spots
                                     < total_spots
                                THEN available_spots + 1
                                ELSE total_spots
                            END,
                        updated_at =
                            SYSUTCDATETIME()
                    WHERE id = %s
                    """,
                    (reservation["parking_id"],)
                )

            updated_reservation = _get_reservation(
                int(reservation_id)
            )

            return success_response(
                updated_reservation,
                "Reserva actualizada"
            )

        return error_response(
            "Ruta no encontrada",
            404
        )

    except PermissionError as exc:
        return error_response(
            str(exc),
            401
        )

    except ValueError as exc:
        return error_response(
            str(exc),
            400
        )

    except Exception as exc:
        return error_response(
            "Error interno del servidor",
            500,
            str(exc)
        )
