CREATE TABLE `taxatie_mail_archives` (
  `id` VARCHAR(191) NOT NULL,
  `messageId` VARCHAR(191) NOT NULL,
  `mailbox` VARCHAR(191) NOT NULL,
  `fromEmail` VARCHAR(191) NULL,
  `toEmail` VARCHAR(191) NULL,
  `subject` VARCHAR(191) NULL,
  `receivedAt` DATETIME(3) NULL,
  `projectId` VARCHAR(191) NULL,
  `matchStatus` VARCHAR(191) NOT NULL DEFAULT 'unmatched',
  `archiveStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `matchScore` INTEGER NULL,
  `matchReasons` JSON NULL,
  `candidates` JSON NULL,
  `checklistSignals` JSON NULL,
  `suggestedSubfolder` VARCHAR(191) NULL,
  `suggestedStatus` VARCHAR(191) NULL,
  `nextcloudPath` TEXT NULL,
  `error` TEXT NULL,
  `rawPayload` JSON NULL,
  `reviewedAt` DATETIME(3) NULL,
  `reviewedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `taxatie_mail_archives_messageId_mailbox_key` (`messageId`, `mailbox`),
  INDEX `taxatie_mail_archives_projectId_idx` (`projectId`),
  INDEX `taxatie_mail_archives_matchStatus_idx` (`matchStatus`),
  INDEX `taxatie_mail_archives_archiveStatus_idx` (`archiveStatus`),
  INDEX `taxatie_mail_archives_receivedAt_idx` (`receivedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `taxatie_mail_archives`
  ADD CONSTRAINT `taxatie_mail_archives_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
