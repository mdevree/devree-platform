ALTER TABLE `project_proposals`
  ADD COLUMN `selectedSilentSale` BOOLEAN NULL AFTER `selectedStartReden`,
  ADD COLUMN `selectedRemarks` TEXT NULL AFTER `selectedSilentSale`;
