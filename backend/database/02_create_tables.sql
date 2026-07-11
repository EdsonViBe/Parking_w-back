USE ParkingAppDB;
GO

/* =========================================================
   1. USERS
   ========================================================= */
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.users
    (
        id              INT IDENTITY(1,1) NOT NULL,
        name            NVARCHAR(120) NOT NULL,
        email           NVARCHAR(150) NOT NULL,
        password_hash   NVARCHAR(500) NOT NULL,
        role            NVARCHAR(20) NOT NULL,
        phone           NVARCHAR(25) NULL,
        is_active       BIT NOT NULL
            CONSTRAINT DF_users_is_active DEFAULT (1),
        created_at      DATETIME2(0) NOT NULL
            CONSTRAINT DF_users_created_at DEFAULT SYSUTCDATETIME(),
        updated_at      DATETIME2(0) NULL,

        CONSTRAINT PK_users PRIMARY KEY (id),
        CONSTRAINT UQ_users_email UNIQUE (email),
        CONSTRAINT CK_users_role
            CHECK (role IN (N'driver', N'owner', N'admin'))
    );
END
GO

/* =========================================================
   2. PARKINGS
   ========================================================= */
IF OBJECT_ID(N'dbo.parkings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.parkings
    (
        id                INT IDENTITY(1,1) NOT NULL,
        owner_id          INT NOT NULL,
        title             NVARCHAR(150) NOT NULL,
        address           NVARCHAR(250) NOT NULL,
        district          NVARCHAR(100) NOT NULL,
        description       NVARCHAR(1000) NULL,
        price_per_hour    DECIMAL(10,2) NOT NULL,
        total_spots       INT NOT NULL,
        available_spots   INT NOT NULL,
        open_time         TIME(0) NULL,
        close_time        TIME(0) NULL,
        latitude          DECIMAL(10,7) NULL,
        longitude         DECIMAL(10,7) NULL,
        image_url         NVARCHAR(500) NULL,
        is_active         BIT NOT NULL
            CONSTRAINT DF_parkings_is_active DEFAULT (1),
        created_at        DATETIME2(0) NOT NULL
            CONSTRAINT DF_parkings_created_at DEFAULT SYSUTCDATETIME(),
        updated_at        DATETIME2(0) NULL,

        CONSTRAINT PK_parkings PRIMARY KEY (id),

        CONSTRAINT FK_parkings_owner
            FOREIGN KEY (owner_id)
            REFERENCES dbo.users(id),

        CONSTRAINT CK_parkings_price
            CHECK (price_per_hour >= 0),

        CONSTRAINT CK_parkings_total_spots
            CHECK (total_spots > 0),

        CONSTRAINT CK_parkings_available_spots
            CHECK (
                available_spots >= 0
                AND available_spots <= total_spots
            ),

        CONSTRAINT CK_parkings_schedule
            CHECK (
                open_time IS NULL
                OR close_time IS NULL
                OR open_time < close_time
            )
    );
END
GO

/* =========================================================
   3. PARKING VEHICLE TYPES
   ========================================================= */
IF OBJECT_ID(N'dbo.parking_vehicle_types', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.parking_vehicle_types
    (
        parking_id     INT NOT NULL,
        vehicle_type   NVARCHAR(30) NOT NULL,

        CONSTRAINT PK_parking_vehicle_types
            PRIMARY KEY (parking_id, vehicle_type),

        CONSTRAINT FK_parking_vehicle_types_parking
            FOREIGN KEY (parking_id)
            REFERENCES dbo.parkings(id)
            ON DELETE CASCADE,

        CONSTRAINT CK_parking_vehicle_types_type
            CHECK (
                vehicle_type IN
                (N'car', N'motorcycle', N'suv', N'bicycle')
            )
    );
END
GO

/* =========================================================
   4. RESERVATIONS
   ========================================================= */
IF OBJECT_ID(N'dbo.reservations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.reservations
    (
        id              INT IDENTITY(1,1) NOT NULL,
        user_id         INT NOT NULL,
        parking_id      INT NOT NULL,
        start_time      DATETIME2(0) NOT NULL,
        end_time        DATETIME2(0) NOT NULL,
        vehicle_plate   NVARCHAR(15) NULL,
        vehicle_type    NVARCHAR(30) NULL,
        total_amount    DECIMAL(10,2) NOT NULL,
        status          NVARCHAR(20) NOT NULL
            CONSTRAINT DF_reservations_status DEFAULT (N'pending'),
        created_at      DATETIME2(0) NOT NULL
            CONSTRAINT DF_reservations_created_at DEFAULT SYSUTCDATETIME(),
        updated_at      DATETIME2(0) NULL,

        CONSTRAINT PK_reservations PRIMARY KEY (id),

        CONSTRAINT FK_reservations_user
            FOREIGN KEY (user_id)
            REFERENCES dbo.users(id),

        CONSTRAINT FK_reservations_parking
            FOREIGN KEY (parking_id)
            REFERENCES dbo.parkings(id),

        CONSTRAINT CK_reservations_dates
            CHECK (end_time > start_time),

        CONSTRAINT CK_reservations_amount
            CHECK (total_amount >= 0),

        CONSTRAINT CK_reservations_status
            CHECK (
                status IN
                (N'pending', N'confirmed', N'cancelled', N'completed')
            ),

        CONSTRAINT CK_reservations_vehicle_type
            CHECK (
                vehicle_type IS NULL
                OR vehicle_type IN
                (N'car', N'motorcycle', N'suv', N'bicycle')
            )
    );
END
GO
