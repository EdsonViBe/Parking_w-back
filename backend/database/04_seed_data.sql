USE ParkingAppDB;
GO

/* =========================================================
   DATOS INICIALES PARA PARKING APP
   El script se puede ejecutar varias veces sin duplicar datos.

   Credenciales de prueba:
   admin@parking.com  / Admin123
   owner@parking.com  / Owner123
   driver@parking.com / Driver123
   ========================================================= */

/* 1. USUARIOS */
IF NOT EXISTS (
    SELECT 1 FROM dbo.users WHERE email = N'admin@parking.com'
)
BEGIN
    INSERT INTO dbo.users
        (name, email, password_hash, role, phone)
    VALUES
    (
        N'Administrador Parking',
        N'admin@parking.com',
        N'pbkdf2_sha256$310000$cGFya2luZy1hZG1pbi0wMQ==$Eb3OOGLFaf8UnLDwZF2xh9M0PbQ49HYEQ62WcoM8f4U=',
        N'admin',
        N'999999999'
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM dbo.users WHERE email = N'owner@parking.com'
)
BEGIN
    INSERT INTO dbo.users
        (name, email, password_hash, role, phone)
    VALUES
    (
        N'Propietario Demo',
        N'owner@parking.com',
        N'pbkdf2_sha256$310000$cGFya2luZy1vd25lci0wMQ==$gyk62ipdzb93VI1tAZcGXLxYtV96W5tWKCPWvoDmgFk=',
        N'owner',
        N'988888888'
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM dbo.users WHERE email = N'driver@parking.com'
)
BEGIN
    INSERT INTO dbo.users
        (name, email, password_hash, role, phone)
    VALUES
    (
        N'Conductor Demo',
        N'driver@parking.com',
        N'pbkdf2_sha256$310000$cGFya2luZy1kcml2ZXIwMQ==$pB7GGW1YtKxRR8gwz/9A++08EfcS4heBhOyyrFVYPmE=',
        N'driver',
        N'977777777'
    );
END
GO

/* 2. PARKING SAN ISIDRO */
DECLARE @OwnerIdSanIsidro INT;

SELECT @OwnerIdSanIsidro = id
FROM dbo.users
WHERE email = N'owner@parking.com';

IF @OwnerIdSanIsidro IS NULL
    THROW 50001, 'No se encontró el usuario propietario owner@parking.com.', 1;

IF NOT EXISTS
(
    SELECT 1
    FROM dbo.parkings
    WHERE owner_id = @OwnerIdSanIsidro
      AND title = N'Parking San Isidro'
)
BEGIN
    INSERT INTO dbo.parkings
    (
        owner_id,
        title,
        address,
        district,
        description,
        price_per_hour,
        total_spots,
        available_spots,
        open_time,
        close_time,
        latitude,
        longitude,
        image_url
    )
    VALUES
    (
        @OwnerIdSanIsidro,
        N'Parking San Isidro',
        N'Av. Javier Prado 1234',
        N'San Isidro',
        N'Estacionamiento seguro cerca del centro financiero.',
        8.00,
        20,
        20,
        '06:00',
        '23:00',
        -12.0950000,
        -77.0350000,
        NULL
    );
END
GO

/* 3. PARKING MIRAFLORES */
DECLARE @OwnerIdMiraflores INT;

SELECT @OwnerIdMiraflores = id
FROM dbo.users
WHERE email = N'owner@parking.com';

IF @OwnerIdMiraflores IS NULL
    THROW 50002, 'No se encontró el usuario propietario owner@parking.com.', 1;

IF NOT EXISTS
(
    SELECT 1
    FROM dbo.parkings
    WHERE owner_id = @OwnerIdMiraflores
      AND title = N'Parking Miraflores'
)
BEGIN
    INSERT INTO dbo.parkings
    (
        owner_id,
        title,
        address,
        district,
        description,
        price_per_hour,
        total_spots,
        available_spots,
        open_time,
        close_time,
        latitude,
        longitude,
        image_url
    )
    VALUES
    (
        @OwnerIdMiraflores,
        N'Parking Miraflores',
        N'Av. Larco 560',
        N'Miraflores',
        N'Estacionamiento céntrico con atención diaria.',
        7.50,
        15,
        15,
        '07:00',
        '22:00',
        -12.1219000,
        -77.0296000,
        NULL
    );
END
GO

/* 4. TIPOS DE VEHÍCULO: SAN ISIDRO */
DECLARE @ParkingSanIsidroId INT;

SELECT TOP (1) @ParkingSanIsidroId = id
FROM dbo.parkings
WHERE title = N'Parking San Isidro'
ORDER BY id;

IF @ParkingSanIsidroId IS NULL
    THROW 50003, 'No se encontró Parking San Isidro.', 1;

INSERT INTO dbo.parking_vehicle_types
    (parking_id, vehicle_type)
SELECT
    @ParkingSanIsidroId,
    tipos.vehicle_type
FROM
(
    VALUES
        (N'car'),
        (N'motorcycle'),
        (N'suv')
) AS tipos(vehicle_type)
WHERE NOT EXISTS
(
    SELECT 1
    FROM dbo.parking_vehicle_types AS existentes
    WHERE existentes.parking_id = @ParkingSanIsidroId
      AND existentes.vehicle_type = tipos.vehicle_type
);
GO

/* 5. TIPOS DE VEHÍCULO: MIRAFLORES */
DECLARE @ParkingMirafloresId INT;

SELECT TOP (1) @ParkingMirafloresId = id
FROM dbo.parkings
WHERE title = N'Parking Miraflores'
ORDER BY id;

IF @ParkingMirafloresId IS NULL
    THROW 50004, 'No se encontró Parking Miraflores.', 1;

INSERT INTO dbo.parking_vehicle_types
    (parking_id, vehicle_type)
SELECT
    @ParkingMirafloresId,
    tipos.vehicle_type
FROM
(
    VALUES
        (N'car'),
        (N'motorcycle')
) AS tipos(vehicle_type)
WHERE NOT EXISTS
(
    SELECT 1
    FROM dbo.parking_vehicle_types AS existentes
    WHERE existentes.parking_id = @ParkingMirafloresId
      AND existentes.vehicle_type = tipos.vehicle_type
);
GO

PRINT N'Datos iniciales insertados o verificados correctamente.';
GO