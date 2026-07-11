USE ParkingAppDB;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_users_email'
      AND object_id = OBJECT_ID(N'dbo.users')
)
BEGIN
    CREATE INDEX IX_users_email
        ON dbo.users(email);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_parkings_owner_id'
      AND object_id = OBJECT_ID(N'dbo.parkings')
)
BEGIN
    CREATE INDEX IX_parkings_owner_id
        ON dbo.parkings(owner_id);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_parkings_district_active'
      AND object_id = OBJECT_ID(N'dbo.parkings')
)
BEGIN
    CREATE INDEX IX_parkings_district_active
        ON dbo.parkings(district, is_active);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_reservations_user_created'
      AND object_id = OBJECT_ID(N'dbo.reservations')
)
BEGIN
    CREATE INDEX IX_reservations_user_created
        ON dbo.reservations(user_id, created_at DESC);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_reservations_parking_created'
      AND object_id = OBJECT_ID(N'dbo.reservations')
)
BEGIN
    CREATE INDEX IX_reservations_parking_created
        ON dbo.reservations(parking_id, created_at DESC);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_reservations_schedule'
      AND object_id = OBJECT_ID(N'dbo.reservations')
)
BEGIN
    CREATE INDEX IX_reservations_schedule
        ON dbo.reservations(parking_id, start_time, end_time, status);
END
GO
