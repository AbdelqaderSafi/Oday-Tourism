-- Add city column to trips table (was missing from initial migration)
ALTER TABLE `trips` ADD COLUMN `city` ENUM('SHARM_EL_SHEIKH', 'EL_GHARDQA', 'EL_AIN_SOKHNA', 'DAHAB') NOT NULL DEFAULT 'SHARM_EL_SHEIKH';

-- Add city column to comments table (was missing from initial migration)
ALTER TABLE `comments` ADD COLUMN `city` VARCHAR(255) NOT NULL DEFAULT '';

-- Align trip_name in comments to NOT NULL (was NULL in initial migration)
ALTER TABLE `comments` MODIFY COLUMN `trip_name` VARCHAR(255) NOT NULL DEFAULT '';

-- Drop is_hidden column from comments (not present in current schema)
ALTER TABLE `comments` DROP COLUMN `is_hidden`;
