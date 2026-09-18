-- AlterTable
ALTER TABLE `wa_messages` MODIFY `deliveryStatus` ENUM('SENT', 'FAILED', 'DELIVERED', 'READ') NULL;

-- CreateTable
CREATE TABLE `pbx_requests` (
    `id` VARCHAR(191) NOT NULL,
    `callId` VARCHAR(100) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `consentAt` DATETIME(3) NULL,
    `contactId` INTEGER NULL,
    `contactName` VARCHAR(191) NULL,
    `contactCheckedAt` DATETIME(3) NULL,
    `conversationId` VARCHAR(191) NULL,
    `taskId` VARCHAR(191) NULL,
    `recordingHash` VARCHAR(64) NULL,
    `recordingBytes` INTEGER NULL,
    `recordingDeletedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pbx_requests_callId_key`(`callId`),
    INDEX `pbx_requests_phone_kind_idx`(`phone`, `kind`),
    INDEX `pbx_requests_taskId_idx`(`taskId`),
    INDEX `pbx_requests_receivedAt_idx`(`receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pbx_events` (
    `id` VARCHAR(150) NOT NULL,
    `callId` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pbx_events_callId_idx`(`callId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pbx_outbox` (
    `id` VARCHAR(191) NOT NULL,
    `dedupeKey` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `body` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `providerMsgId` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `claimedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pbx_outbox_dedupeKey_key`(`dedupeKey`),
    INDEX `pbx_outbox_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wa_provider_receipts` (
    `providerId` VARCHAR(191) NOT NULL,
    `ack` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `wa_provider_receipts_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`providerId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pbx_requests` ADD CONSTRAINT `pbx_requests_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

