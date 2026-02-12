-- CreateTable
CREATE TABLE `call_notes` (
    `id` VARCHAR(191) NOT NULL,
    `callId` VARCHAR(191) NOT NULL,
    `note` TEXT NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `call_notes_callId_idx`(`callId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `call_notes` ADD CONSTRAINT `call_notes_callId_fkey` FOREIGN KEY (`callId`) REFERENCES `calls`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
