from decimal import Decimal, InvalidOperation


def require_fields(data: dict, fields: list[str]) -> None:
    missing = [field for field in fields if data.get(field) in (None, "")]
    if missing:
        raise ValueError("Faltan campos obligatorios: " + ", ".join(missing))


def normalize_email(value: str) -> str:
    return value.strip().lower()


def parse_int(value, field_name: str, minimum: int | None = None) -> int:
    try:
        result = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} debe ser un número entero") from exc
    if minimum is not None and result < minimum:
        raise ValueError(f"{field_name} debe ser mayor o igual a {minimum}")
    return result


def parse_decimal(value, field_name: str, minimum: Decimal | None = None) -> Decimal:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} debe ser un número válido") from exc
    if minimum is not None and result < minimum:
        raise ValueError(f"{field_name} debe ser mayor o igual a {minimum}")
    return result
