CREATE TABLE `project_proposal_events` (
  `id` VARCHAR(191) NOT NULL,
  `proposalId` VARCHAR(191) NOT NULL,
  `eventType` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NULL,
  `activeSeconds` INTEGER NULL,
  `path` TEXT NULL,
  `referrer` TEXT NULL,
  `userAgent` TEXT NULL,
  `ipHash` VARCHAR(191) NULL,
  `viewport` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `project_proposal_events_proposalId_idx`(`proposalId`),
  INDEX `project_proposal_events_eventType_idx`(`eventType`),
  INDEX `project_proposal_events_sessionId_idx`(`sessionId`),
  INDEX `project_proposal_events_createdAt_idx`(`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `project_proposal_events`
  ADD CONSTRAINT `project_proposal_events_proposalId_fkey`
  FOREIGN KEY (`proposalId`) REFERENCES `project_proposals`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
