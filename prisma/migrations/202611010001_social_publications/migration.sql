-- CreateTable
CREATE TABLE `social_publications` (
    `id` VARCHAR(191) NOT NULL,
    `aliases` JSON NOT NULL,
    `externalKey` VARCHAR(191) NULL,
    `source` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(191) NOT NULL,
    `account` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `scheduledAt` DATETIME(3) NULL,
    `publishedAt` DATETIME(3) NULL,
    `dateBasis` VARCHAR(191) NOT NULL,
    `releaseId` VARCHAR(191) NULL,
    `releaseUrl` TEXT NULL,
    `mediaUrl` TEXT NULL,
    `sourceUrl` TEXT NULL,
    `confirmed` BOOLEAN NOT NULL DEFAULT false,
    `everPublished` BOOLEAN NOT NULL DEFAULT false,
    `removed` BOOLEAN NOT NULL DEFAULT false,
    `excluded` BOOLEAN NOT NULL DEFAULT false,
    `mappingLocked` BOOLEAN NOT NULL DEFAULT false,
    `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `social_publications_externalKey_key`(`externalKey`),
    INDEX `social_publications_channel_state_idx`(`channel`, `state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `social_project_links` (
    `publicationId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`publicationId`, `projectId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `social_publication_events` (
    `id` VARCHAR(191) NOT NULL,
    `publicationId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actor` VARCHAR(191) NOT NULL,
    `detail` JSON NOT NULL,

    INDEX `social_publication_events_publicationId_createdAt_idx`(`publicationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `social_evidence` (
    `publicationId` VARCHAR(191) NOT NULL,
    `mime` VARCHAR(191) NOT NULL,
    `data` LONGBLOB NOT NULL,

    PRIMARY KEY (`publicationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `social_project_links` ADD CONSTRAINT `social_project_links_publicationId_fkey` FOREIGN KEY (`publicationId`) REFERENCES `social_publications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_project_links` ADD CONSTRAINT `social_project_links_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_publication_events` ADD CONSTRAINT `social_publication_events_publicationId_fkey` FOREIGN KEY (`publicationId`) REFERENCES `social_publications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_evidence` ADD CONSTRAINT `social_evidence_publicationId_fkey` FOREIGN KEY (`publicationId`) REFERENCES `social_publications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

