USE ParkingAppDB;
GO

SELECT
    id, name, email, role, phone, is_active, created_at
FROM dbo.users
ORDER BY id;
GO

SELECT
    p.id,
    p.title,
    p.address,
    p.district,
    p.price_per_hour,
    p.total_spots,
    p.available_spots,
    p.is_active,
    u.name AS owner_name
FROM dbo.parkings AS p
INNER JOIN dbo.users AS u
    ON u.id = p.owner_id
ORDER BY p.id;
GO

SELECT
    p.title,
    pvt.vehicle_type
FROM dbo.parking_vehicle_types AS pvt
INNER JOIN dbo.parkings AS p
    ON p.id = pvt.parking_id
ORDER BY p.title, pvt.vehicle_type;
GO

SELECT
    r.id,
    u.name AS driver_name,
    p.title AS parking_title,
    r.start_time,
    r.end_time,
    r.total_amount,
    r.status
FROM dbo.reservations AS r
INNER JOIN dbo.users AS u
    ON u.id = r.user_id
INNER JOIN dbo.parkings AS p
    ON p.id = r.parking_id
ORDER BY r.created_at DESC;
GO
