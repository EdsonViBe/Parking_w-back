USE master;
GO

IF DB_ID(N'ParkingAppDB') IS NULL
BEGIN
    CREATE DATABASE ParkingAppDB;
END
GO

USE ParkingAppDB;
GO
