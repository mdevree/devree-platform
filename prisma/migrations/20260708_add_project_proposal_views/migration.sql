ALTER TABLE `project_proposals`
  ADD COLUMN `viewedAt` DATETIME(3) NULL AFTER `expiresAt`,
  ADD COLUMN `lastViewedAt` DATETIME(3) NULL AFTER `viewedAt`,
  ADD COLUMN `viewCount` INTEGER NOT NULL DEFAULT 0 AFTER `lastViewedAt`;
