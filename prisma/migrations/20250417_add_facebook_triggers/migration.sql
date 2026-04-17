-- CreateTable
CREATE TABLE `facebook_triggers` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `postId` VARCHAR(191) NOT NULL,
    `keyword` VARCHAR(191) NOT NULL,
    `dmTekst` TEXT NOT NULL,
    `actief` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `facebook_triggers_postId_idx`(`postId`),
    INDEX `facebook_triggers_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `facebook_triggers` ADD CONSTRAINT `facebook_triggers_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
