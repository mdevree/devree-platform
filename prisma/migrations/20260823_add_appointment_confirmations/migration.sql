-- CreateTable
CREATE TABLE `appointment_confirmations` (
    `id` VARCHAR(191) NOT NULL,
    `agendaAfspraakId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `publicUrl` TEXT NULL,
    `previewUrl` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `recipientName` VARCHAR(191) NULL,
    `recipientPhone` VARCHAR(191) NULL,
    `recipientEmail` VARCHAR(191) NULL,
    `mauticContactId` INTEGER NULL,
    `projectId` VARCHAR(191) NULL,
    `woningTitle` VARCHAR(191) NULL,
    `woningAdres` VARCHAR(191) NULL,
    `woningUrl` TEXT NULL,
    `appointmentStart` DATETIME(3) NULL,
    `appointmentEnd` DATETIME(3) NULL,
    `medewerker` VARCHAR(191) NULL,
    `whatsappBody` TEXT NOT NULL,
    `videoPath` TEXT NULL,
    `videoOriginalName` VARCHAR(191) NULL,
    `videoMimeType` VARCHAR(191) NULL,
    `videoSizeBytes` INTEGER NULL,
    `sentAt` DATETIME(3) NULL,
    `openedAt` DATETIME(3) NULL,
    `lastOpenedAt` DATETIME(3) NULL,
    `openCount` INTEGER NOT NULL DEFAULT 0,
    `videoStartedAt` DATETIME(3) NULL,
    `videoCompletedAt` DATETIME(3) NULL,
    `videoStartCount` INTEGER NOT NULL DEFAULT 0,
    `videoCompleteCount` INTEGER NOT NULL DEFAULT 0,
    `confirmedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `waConversationId` VARCHAR(191) NULL,
    `waMessageId` VARCHAR(191) NULL,
    `deliveryError` TEXT NULL,
    `createdBy` VARCHAR(191) NOT NULL DEFAULT 'platform',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `appointment_confirmations_tokenHash_key`(`tokenHash`),
    UNIQUE INDEX `appointment_confirmations_agendaAfspraakId_key`(`agendaAfspraakId`),
    INDEX `appointment_confirmations_status_idx`(`status`),
    INDEX `appointment_confirmations_mauticContactId_idx`(`mauticContactId`),
    INDEX `appointment_confirmations_projectId_idx`(`projectId`),
    INDEX `appointment_confirmations_appointmentStart_idx`(`appointmentStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `appointment_confirmation_events` (
    `id` VARCHAR(191) NOT NULL,
    `confirmationId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NULL,
    `activeSeconds` INTEGER NULL,
    `path` TEXT NULL,
    `referrer` TEXT NULL,
    `userAgent` TEXT NULL,
    `ipHash` VARCHAR(191) NULL,
    `viewport` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `appointment_confirmation_events_confirmationId_idx`(`confirmationId`),
    INDEX `appointment_confirmation_events_eventType_idx`(`eventType`),
    INDEX `appointment_confirmation_events_sessionId_idx`(`sessionId`),
    INDEX `appointment_confirmation_events_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `appointment_confirmations` ADD CONSTRAINT `appointment_confirmations_agendaAfspraakId_fkey` FOREIGN KEY (`agendaAfspraakId`) REFERENCES `agenda_afspraken`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointment_confirmation_events` ADD CONSTRAINT `appointment_confirmation_events_confirmationId_fkey` FOREIGN KEY (`confirmationId`) REFERENCES `appointment_confirmations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
