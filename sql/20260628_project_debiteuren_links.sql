-- Handmatige SQL voor de platform database.
-- Niet via prisma migrate uitvoeren zolang de migratiehistorie handmatig beheerd wordt.

CREATE TABLE IF NOT EXISTS `project_debiteuren_links` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `debiteurenKlantId` INT NOT NULL,
  `klantNaam` VARCHAR(191) NULL,
  `klantEmail` VARCHAR(191) NULL,
  `klantAdres` VARCHAR(191) NULL,
  `linkedBy` VARCHAR(191) NULL,
  `linkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastCheckedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_debiteuren_links_projectId_key` (`projectId`),
  KEY `project_debiteuren_links_debiteurenKlantId_idx` (`debiteurenKlantId`),
  CONSTRAINT `project_debiteuren_links_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
