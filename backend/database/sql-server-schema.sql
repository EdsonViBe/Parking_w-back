CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(120) NOT NULL,
    email NVARCHAR(180) NOT NULL UNIQUE,
    password_hash NVARCHAR(500) NOT NULL,
    role NVARCHAR(20) NOT NULL CHECK (role IN ('driver','owner','admin')),
    phone NVARCHAR(30) NULL,
    is_active BIT NOT NULL CONSTRAINT DF_users_active DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_users_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_users_updated DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE parkings (
    id INT IDENTITY(1,1) PRIMARY KEY,
    owner_id INT NOT NULL,
    title NVARCHAR(160) NOT NULL,
    address NVARCHAR(250) NOT NULL,
    district NVARCHAR(100) NOT NULL,
    description NVARCHAR(1000) NULL,
    price_per_hour DECIMAL(10,2) NOT NULL CHECK (price_per_hour >= 0),
    total_spots INT NOT NULL CHECK (total_spots > 0),
    available_spots INT NOT NULL CHECK (available_spots >= 0),
    open_time TIME NULL,
    close_time TIME NULL,
    latitude DECIMAL(9,6) NULL,
    longitude DECIMAL(9,6) NULL,
    is_active BIT NOT NULL CONSTRAINT DF_parkings_active DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_parkings_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_parkings_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_parkings_owner FOREIGN KEY (owner_id) REFERENCES users(id)
);
GO
CREATE INDEX IX_parkings_district ON parkings(district, is_active);
CREATE INDEX IX_parkings_owner ON parkings(owner_id);
GO

CREATE TABLE reservations (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    parking_id INT NOT NULL,
    start_time DATETIME2 NOT NULL,
    end_time DATETIME2 NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    status NVARCHAR(20) NOT NULL CHECK (status IN ('pending','confirmed','cancelled','completed')),
    vehicle_plate NVARCHAR(15) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_reservations_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_reservations_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_reservations_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT FK_reservations_parking FOREIGN KEY (parking_id) REFERENCES parkings(id),
    CONSTRAINT CK_reservations_dates CHECK (end_time > start_time)
);
GO
CREATE INDEX IX_reservations_user ON reservations(user_id, created_at DESC);
CREATE INDEX IX_reservations_parking ON reservations(parking_id, start_time, end_time);
GO
