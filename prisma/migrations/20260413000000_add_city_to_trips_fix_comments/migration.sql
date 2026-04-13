-- Add city column to trips table (was missing from initial migration)
-- Uses stored procedure to safely add only if column does not already exist
DROP PROCEDURE IF EXISTS add_city_to_trips;
CREATE PROCEDURE add_city_to_trips()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'trips'
      AND COLUMN_NAME  = 'city'
  ) THEN
    ALTER TABLE `trips`
      ADD COLUMN `city` ENUM('SHARM_EL_SHEIKH','EL_GHARDQA','EL_AIN_SOKHNA','DAHAB')
      NOT NULL DEFAULT 'SHARM_EL_SHEIKH';
  END IF;
END;
CALL add_city_to_trips();
DROP PROCEDURE IF EXISTS add_city_to_trips;

-- Add city column to comments table (was missing from initial migration)
DROP PROCEDURE IF EXISTS add_city_to_comments;
CREATE PROCEDURE add_city_to_comments()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'comments'
      AND COLUMN_NAME  = 'city'
  ) THEN
    ALTER TABLE `comments`
      ADD COLUMN `city` VARCHAR(255) NOT NULL DEFAULT '';
  END IF;
END;
CALL add_city_to_comments();
DROP PROCEDURE IF EXISTS add_city_to_comments;

-- Drop is_hidden column from comments only if it exists
DROP PROCEDURE IF EXISTS drop_is_hidden_from_comments;
CREATE PROCEDURE drop_is_hidden_from_comments()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'comments'
      AND COLUMN_NAME  = 'is_hidden'
  ) THEN
    ALTER TABLE `comments` DROP COLUMN `is_hidden`;
  END IF;
END;
CALL drop_is_hidden_from_comments();
DROP PROCEDURE IF EXISTS drop_is_hidden_from_comments;
