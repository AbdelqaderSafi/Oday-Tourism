-- CreateTable: destination_images
CREATE TABLE `destination_images` (
    `id` VARCHAR(36) NOT NULL,
    `destination` ENUM('SHARM_EL_SHEIKH', 'EL_GHARDQA', 'EL_AIN_SOKHNA', 'DAHAB', 'EL_GOUNA', 'NORTH_COAST', 'CAIRO', 'ALEXANDRIA', 'SAHL_HASHEESH', 'MARSA_MATROUH', 'MARSA_ALAM', 'FAYOUM') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `destination_images_destination_key`(`destination`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: add destination_image_id to assets
ALTER TABLE `assets` ADD COLUMN `destination_image_id` VARCHAR(36) NULL;

-- CreateIndex
CREATE INDEX `assets_destination_image_id_idx` ON `assets`(`destination_image_id`);

-- AlterEnum: add DESTINATION_IMAGE to AssetKind
ALTER TABLE `assets` MODIFY COLUMN `kind` ENUM('HOTEL_MAIN_IMAGE', 'HOTEL_GALLERY_IMAGE', 'TRIP_MAIN_IMAGE', 'TRIP_GALLERY_IMAGE', 'OFFER_IMAGE', 'GALLERY_IMAGE', 'PHOTO_GALLERY_IMAGE', 'DESTINATION_IMAGE') NOT NULL;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_destination_image_id_fkey` FOREIGN KEY (`destination_image_id`) REFERENCES `destination_images`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
