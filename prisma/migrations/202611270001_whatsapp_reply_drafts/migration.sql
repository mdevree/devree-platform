CREATE TABLE `wa_reply_threads` (
    `id` VARCHAR(64) NOT NULL,
    `account` VARCHAR(12) NOT NULL,
    `chatId` VARCHAR(40) NOT NULL,
    `lid` VARCHAR(40) NULL,
    `activeDraftId` VARCHAR(191) NULL,
    `lastReplyAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `wa_reply_threads_account_lid_key`(`account`, `lid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `wa_reply_events` (
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(64) NOT NULL,
    `providerMessageId` VARCHAR(191) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `body` TEXT NULL,

    UNIQUE INDEX `wa_reply_events_threadId_providerMessageId_key`(`threadId`, `providerMessageId`),
    INDEX `wa_reply_events_threadId_receivedAt_idx`(`threadId`, `receivedAt`),
    INDEX `wa_reply_events_receivedAt_idx`(`receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `wa_reply_drafts` (
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(64) NOT NULL,
    `account` VARCHAR(12) NOT NULL,
    `ownerUserId` VARCHAR(191) NULL,
    `conversationId` VARCHAR(191) NULL,
    `mauticContactId` INTEGER NULL,
    `recipientName` VARCHAR(191) NULL,
    `sourceAt` DATETIME(3) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'pending',
    `revision` INTEGER NOT NULL DEFAULT 1,
    `readyAt` DATETIME(3) NULL,
    `nextAttempt` DATETIME(3) NULL,
    `claim` VARCHAR(36) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `body` TEXT NULL,
    `summary` TEXT NULL,
    `edited` BOOLEAN NOT NULL DEFAULT false,
    `sentAt` DATETIME(3) NULL,
    `providerMessageId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `wa_reply_drafts_account_status_readyAt_idx`(`account`, `status`, `readyAt`),
    INDEX `wa_reply_drafts_ownerUserId_status_idx`(`ownerUserId`, `status`),
    INDEX `wa_reply_drafts_status_nextAttempt_idx`(`status`, `nextAttempt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `wa_reply_events` ADD CONSTRAINT `wa_reply_events_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `wa_reply_threads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `wa_reply_drafts` ADD CONSTRAINT `wa_reply_drafts_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `wa_reply_threads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
