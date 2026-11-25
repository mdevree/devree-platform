-- CreateTable
CREATE TABLE `housing_alert_rules` (
    `id` VARCHAR(191) NOT NULL,
    `contactId` INTEGER NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `recipientName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `address` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `addressKey` VARCHAR(191) NOT NULL,
    `marketObjectId` VARCHAR(191) NULL,
    `kind` VARCHAR(191) NOT NULL,
    `mode` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `state` VARCHAR(191) NOT NULL DEFAULT 'active',
    `template` TEXT NOT NULL,
    `note` TEXT NULL,
    `initialPrice` INTEGER NULL,
    `activeFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `housing_alert_rules_addressKey_state_idx`(`addressKey`, `state`),
    UNIQUE INDEX `housing_alert_rules_contactId_addressKey_kind_key`(`contactId`, `addressKey`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `housing_alert_events` (
    `id` VARCHAR(191) NOT NULL,
    `mailKey` VARCHAR(191) NOT NULL,
    `sourceCode` VARCHAR(191) NULL,
    `addressKey` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NULL,
    `askingPrice` INTEGER NULL,
    `transactionPrice` INTEGER NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `review` TEXT NULL,

    UNIQUE INDEX `housing_alert_events_mailKey_key`(`mailKey`),
    INDEX `housing_alert_events_addressKey_receivedAt_idx`(`addressKey`, `receivedAt`),
    INDEX `housing_alert_events_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `housing_alert_deliveries` (
    `attemptedAt` DATETIME(3) NULL,
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `ruleId` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `draftId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `housing_alert_deliveries_draftId_key`(`draftId`),
    UNIQUE INDEX `housing_alert_deliveries_eventId_ruleId_key`(`eventId`, `ruleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `housing_alert_deliveries` ADD CONSTRAINT `housing_alert_deliveries_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `housing_alert_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `housing_alert_deliveries` ADD CONSTRAINT `housing_alert_deliveries_ruleId_fkey` FOREIGN KEY (`ruleId`) REFERENCES `housing_alert_rules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `housing_alert_deliveries` ADD CONSTRAINT `housing_alert_deliveries_draftId_fkey` FOREIGN KEY (`draftId`) REFERENCES `follow_up_drafts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
