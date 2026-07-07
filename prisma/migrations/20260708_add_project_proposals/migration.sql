CREATE TABLE `project_proposals` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
  `selectedVerkoopstart` ENUM('DIRECT', 'UITGESTELD', 'SLAPEND') NULL,
  `selectedStartdatum` DATETIME(3) NULL,
  `selectedStartReden` VARCHAR(191) NULL,
  `documensoDocumentId` INTEGER NULL,
  `documensoEnvelopeId` VARCHAR(191) NULL,
  `documensoSigningUrl` TEXT NULL,
  `errorMessage` TEXT NULL,
  `expiresAt` DATETIME(3) NULL,
  `acceptedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `project_proposals_tokenHash_key`(`tokenHash`),
  INDEX `project_proposals_projectId_idx`(`projectId`),
  INDEX `project_proposals_status_idx`(`status`),
  INDEX `project_proposals_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `project_proposals`
  ADD CONSTRAINT `project_proposals_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
