-- Hotel availability: room capacity, calendar revisions and the nightly room calendar.

-- Databases built from the init migration have `room`.`capacity` VARCHAR(50) NOT NULL, which the schema no longer
-- has; inserts that omit it fail in strict mode. Production has no such column (checked 2026-11-11).
-- A prepared statement instead of a stored procedure: it needs no CREATE ROUTINE privilege.
SET @relax_legacy_room_capacity = IF(
  EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'room'
      AND COLUMN_NAME  = 'capacity'
  ),
  'ALTER TABLE `room` MODIFY COLUMN `capacity` VARCHAR(50) NULL',
  'SELECT 1'
);
PREPARE relax_legacy_room_capacity FROM @relax_legacy_room_capacity;
EXECUTE relax_legacy_room_capacity;
DEALLOCATE PREPARE relax_legacy_room_capacity;

-- AlterTable
ALTER TABLE `room` ADD COLUMN `guest_capacity` TINYINT UNSIGNED NULL,
    ADD COLUMN `calendar_revision` INTEGER UNSIGNED NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `hotels` ADD COLUMN `calendar_managed_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `room_calendar_days` (
    `room_id` VARCHAR(36) NOT NULL,
    `stay_date` DATE NOT NULL,
    `available_units` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `rate_override_usd` DECIMAL(10, 2) NULL,
    `rate_override_egp` DECIMAL(10, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`room_id`, `stay_date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `room_calendar_days` ADD CONSTRAINT `room_calendar_days_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
