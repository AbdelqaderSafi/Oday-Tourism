-- CreateTable
-- `nationality`: Prisma `Nationality` without PALESTINIAN_SHARM_ONLY (removed from schema).
CREATE TABLE `nationality_pricing` (
    `id` VARCHAR(36) NOT NULL,
    `nationality` ENUM(
        'PALESTINIAN',
        'PALESTINIAN_SYRIAN',
        'SYRIAN',
        'LEBANESE',
        'IRAQI',
        'IRAQ_DOCUMENT',
        'LIBYAN',
        'YEMENI',
        'AFRICAN',
        'ASIAN',
        'KAZAKHSTAN',
        'UZBEKISTAN',
        'TURKMENISTAN',
        'KYRGYZSTAN',
        'TAJIKISTAN',
        'SUDANESE',
        'SAINT_KITTS_AND_NEVIS',
        'DOMINICA'
    ) NOT NULL,
    `price_24h` DECIMAL(10, 2) NOT NULL,
    `price_72h` DECIMAL(10, 2) NOT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `nationality_pricing_nationality_key`(`nationality`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `airline_pricing` (
    `id` VARCHAR(36) NOT NULL,
    `airline` ENUM(
        'QATAR_AIRWAYS',
        'EMIRATES',
        'AEGEAN',
        'TURKISH_AIRLINES',
        'OMAN_AIR',
        'SAUDIA',
        'ETIHAD',
        'AIR_ARABIA',
        'ROYAL_JORDANIAN',
        'ROYAL_AIR_MAROC',
        'AIR_ALGERIE',
        'NILE_AIR',
        'AIR_CAIRO',
        'OTHER'
    ) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `airline_pricing_airline_key`(`airline`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
