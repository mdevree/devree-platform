-- Handmatige SQL voor de platform database.
-- Niet via prisma migrate uitvoeren zolang de migratiehistorie handmatig beheerd wordt.

CREATE TABLE IF NOT EXISTS `project_debiteuren_invoices` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `debiteurenKlantId` INT NOT NULL,
  `debiteurenFactuurId` INT NOT NULL,
  `factuurnummer` INT NULL,
  `invoiceType` VARCHAR(191) NOT NULL DEFAULT 'taxatie',
  `subject` TEXT NULL,
  `invoiceDate` DATETIME(3) NULL,
  `dueDate` DATETIME(3) NULL,
  `amountExclCents` INT NOT NULL,
  `amountInclCents` INT NOT NULL,
  `hash` VARCHAR(191) NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `createdBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_debiteuren_invoices_idempotencyKey_key` (`idempotencyKey`),
  KEY `project_debiteuren_invoices_projectId_idx` (`projectId`),
  KEY `project_debiteuren_invoices_debiteurenKlantId_idx` (`debiteurenKlantId`),
  KEY `project_debiteuren_invoices_debiteurenFactuurId_idx` (`debiteurenFactuurId`),
  CONSTRAINT `project_debiteuren_invoices_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
