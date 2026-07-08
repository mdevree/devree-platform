ALTER TABLE `project_proposals`
  ADD COLUMN `selectedQuickscanChoice` VARCHAR(191) NULL AFTER `selectedEnergielabelNote`,
  ADD COLUMN `selectedQuickscanNote` TEXT NULL AFTER `selectedQuickscanChoice`;
