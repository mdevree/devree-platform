ALTER TABLE `projects`
  ADD COLUMN `cancelledAt` DATETIME(3) NULL,
  ADD COLUMN `cancellationReason` VARCHAR(191) NULL;
