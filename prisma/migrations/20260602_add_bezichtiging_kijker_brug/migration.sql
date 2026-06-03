-- Brug bezichtiging (AgendaAfspraak) -> kijker-systeem (Lead) + cheatsheet/PDF-tracking
-- Alle kolommen zijn additief en nullable; geen impact op bestaande data.

-- AlterTable
ALTER TABLE `agenda_afspraken`
  ADD COLUMN `leadId`                VARCHAR(191) NULL,
  ADD COLUMN `cheatsheetStatus`      VARCHAR(191) NULL,
  ADD COLUMN `cheatsheetPath`        VARCHAR(191) NULL,
  ADD COLUMN `cheatsheetUrl`         VARCHAR(191) NULL,
  ADD COLUMN `cheatsheetGeneratedAt` DATETIME(3)  NULL;

-- CreateIndex
CREATE INDEX `agenda_afspraken_leadId_idx` ON `agenda_afspraken`(`leadId`);

-- AddForeignKey
ALTER TABLE `agenda_afspraken`
  ADD CONSTRAINT `agenda_afspraken_leadId_fkey`
  FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
