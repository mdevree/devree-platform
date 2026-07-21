-- Handmatige SQL voor de platform database.
-- Niet via prisma migrate uitvoeren zolang de migratiehistorie handmatig beheerd wordt.

ALTER TABLE `project_debiteuren_links`
  ADD COLUMN IF NOT EXISTS `mauticContactId` INT NULL AFTER `klantAdres`,
  ADD COLUMN IF NOT EXISTS `contactWarnings` JSON NULL AFTER `mauticContactId`,
  ADD COLUMN IF NOT EXISTS `normalizationCheckedAt` DATETIME(3) NULL AFTER `contactWarnings`;

CREATE INDEX IF NOT EXISTS `project_debiteuren_links_mauticContactId_idx`
  ON `project_debiteuren_links` (`mauticContactId`);
