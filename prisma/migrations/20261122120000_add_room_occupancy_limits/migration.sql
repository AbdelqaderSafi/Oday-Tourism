-- Room occupancy limits by age. All nullable: null means no limit beyond the room's total capacity.

-- AlterTable
ALTER TABLE `room` ADD COLUMN `adult_capacity` TINYINT UNSIGNED NULL,
    ADD COLUMN `child_capacity` TINYINT UNSIGNED NULL,
    ADD COLUMN `children_under_3_capacity` TINYINT UNSIGNED NULL,
    ADD COLUMN `children_under_6_capacity` TINYINT UNSIGNED NULL,
    ADD COLUMN `children_6_to_12_capacity` TINYINT UNSIGNED NULL;
