-- Drop PALESTINIAN_SHARM_ONLY from MySQL ENUM on `nationality_pricing.nationality`
-- (must match prisma `enum Nationality`). No row may still use the removed value.
ALTER TABLE `nationality_pricing`
MODIFY COLUMN `nationality` ENUM(
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
) NOT NULL;
