-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'makelaar',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'lead',
    `address` VARCHAR(191) NULL,
    `notionPageId` VARCHAR(191) NULL,
    `mauticContactId` INTEGER NULL,
    `contactName` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(191) NULL,
    `contactEmail` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `projects_notionPageId_key`(`notionPageId`),
    INDEX `projects_status_idx`(`status`),
    INDEX `projects_notionPageId_idx`(`notionPageId`),
    INDEX `projects_mauticContactId_idx`(`mauticContactId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `calls` (
    `id` VARCHAR(191) NOT NULL,
    `callId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `direction` VARCHAR(191) NOT NULL,
    `callerNumber` VARCHAR(191) NOT NULL,
    `callerName` VARCHAR(191) NULL,
    `destinationNumber` VARCHAR(191) NOT NULL,
    `destinationUser` VARCHAR(191) NULL,
    `mauticContactId` INTEGER NULL,
    `contactName` VARCHAR(191) NULL,
    `points` INTEGER NOT NULL DEFAULT 0,
    `projectId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `calls_callId_key`(`callId`),
    INDEX `calls_timestamp_idx`(`timestamp`),
    INDEX `calls_callerNumber_idx`(`callerNumber`),
    INDEX `calls_mauticContactId_idx`(`mauticContactId`),
    INDEX `calls_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tasks` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `priority` VARCHAR(191) NOT NULL DEFAULT 'normaal',
    `dueDate` DATETIME(3) NULL,
    `category` VARCHAR(191) NULL,
    `assigneeId` VARCHAR(191) NOT NULL,
    `creatorId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `notionPageId` VARCHAR(191) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tasks_assigneeId_idx`(`assigneeId`),
    INDEX `tasks_status_idx`(`status`),
    INDEX `tasks_dueDate_idx`(`dueDate`),
    INDEX `tasks_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `calls` ADD CONSTRAINT `calls_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

