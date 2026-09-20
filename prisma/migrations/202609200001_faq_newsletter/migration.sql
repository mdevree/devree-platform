-- AlterTable
ALTER TABLE `newsletter_items` ADD COLUMN `sourceActive` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `sourceData` JSON NULL,
    ADD COLUMN `sourceKey` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `newsletter_issues` ADD COLUMN `approvedAt` DATETIME(3) NULL,
    ADD COLUMN `approvedBy` VARCHAR(191) NULL,
    ADD COLUMN `approvedRevision` INTEGER NULL,
    ADD COLUMN `exportAttemptedAt` DATETIME(3) NULL,
    ADD COLUMN `exportHash` VARCHAR(191) NULL,
    ADD COLUMN `exportLockAt` DATETIME(3) NULL,
    ADD COLUMN `exportedRevision` INTEGER NULL,
    ADD COLUMN `firstSentAt` DATETIME(3) NULL,
    ADD COLUMN `monthKey` VARCHAR(191) NULL,
    ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `sentCount` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `newsletter_insights` (
    `id` VARCHAR(191) NOT NULL,
    `keyword` VARCHAR(191) NOT NULL,
    `searches` INTEGER NOT NULL DEFAULT 0,
    `noResults` INTEGER NOT NULL DEFAULT 0,
    `previousSearches` INTEGER NOT NULL DEFAULT 0,
    `state` VARCHAR(191) NOT NULL DEFAULT 'NEW',
    `faqId` INTEGER NULL,
    `note` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `newsletter_insights_keyword_key`(`keyword`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `newsletter_sync` (
    `key` VARCHAR(191) NOT NULL,
    `lastSuccessAt` DATETIME(3) NULL,
    `lastAttemptAt` DATETIME(3) NULL,
    `error` TEXT NULL,
    `data` JSON NULL,
    `lockedAt` DATETIME(3) NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `newsletter_signups` (
    `id` VARCHAR(191) NOT NULL,
    `emailHash` VARCHAR(191) NOT NULL,
    `contactId` INTEGER NULL,
    `tokenHash` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `source` VARCHAR(191) NOT NULL,
    `consentVersion` VARCHAR(191) NOT NULL,
    `lastRequestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `state` VARCHAR(191) NOT NULL DEFAULT 'PENDING',

    UNIQUE INDEX `newsletter_signups_emailHash_key`(`emailHash`),
    UNIQUE INDEX `newsletter_signups_tokenHash_key`(`tokenHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `newsletter_rate_limits` (
    `key` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `expiresAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `newsletter_items_sourceKey_key` ON `newsletter_items`(`sourceKey`);

-- CreateIndex
CREATE UNIQUE INDEX `newsletter_issues_monthKey_key` ON `newsletter_issues`(`monthKey`);
