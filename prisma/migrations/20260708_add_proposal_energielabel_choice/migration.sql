ALTER TABLE `project_proposals`
  ADD COLUMN `selectedEnergielabelChoice` VARCHAR(191) NULL AFTER `selectedStartReden`,
  ADD COLUMN `selectedEnergielabelNote` TEXT NULL AFTER `selectedEnergielabelChoice`;
