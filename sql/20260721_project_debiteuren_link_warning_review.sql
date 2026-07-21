ALTER TABLE `project_debiteuren_links`
  ADD COLUMN IF NOT EXISTS `contactWarningsReviewedAt` DATETIME(3) NULL AFTER `normalizationCheckedAt`,
  ADD COLUMN IF NOT EXISTS `contactWarningsReviewedBy` VARCHAR(191) NULL AFTER `contactWarningsReviewedAt`,
  ADD COLUMN IF NOT EXISTS `contactWarningsReviewNote` TEXT NULL AFTER `contactWarningsReviewedBy`;
