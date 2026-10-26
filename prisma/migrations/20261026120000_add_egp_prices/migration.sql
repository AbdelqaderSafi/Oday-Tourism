-- EGP tariffs are independent of USD prices; existing rows stay NULL until the business supplies them.

-- AlterTable
ALTER TABLE `hotels` ADD COLUMN `initial_price_egp` DECIMAL(10, 2) NULL,
    ADD COLUMN `original_price_egp` DECIMAL(10, 2) NULL;

-- AlterTable
ALTER TABLE `room` ADD COLUMN `price_egp` DECIMAL(10, 2) NULL;

-- AlterTable
ALTER TABLE `hotel_addons` ADD COLUMN `price_egp` DECIMAL(10, 2) NULL;

-- AlterTable
ALTER TABLE `trips` ADD COLUMN `price_egp` DECIMAL(10, 2) NULL;

-- AlterTable
ALTER TABLE `trip_options` ADD COLUMN `price_egp` DECIMAL(10, 2) NULL;

-- AlterTable
ALTER TABLE `trip_addons` ADD COLUMN `price_egp` DECIMAL(10, 2) NULL;
