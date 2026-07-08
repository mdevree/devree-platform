ALTER TABLE `projects`
  ADD COLUMN `realworksSystemId` VARCHAR(191) NULL AFTER `realworksId`,
  ADD COLUMN `realworksProjectSystemId` VARCHAR(191) NULL AFTER `realworksSystemId`;

CREATE INDEX `projects_realworksSystemId_idx` ON `projects`(`realworksSystemId`);
CREATE INDEX `projects_realworksProjectSystemId_idx` ON `projects`(`realworksProjectSystemId`);
