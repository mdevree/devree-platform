ALTER TABLE `social_publications`
  ADD COLUMN `scope` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  ADD COLUMN `classificationReason` TEXT NULL;
UPDATE `social_publications` s SET s.`scope`='property'
WHERE EXISTS (SELECT 1 FROM `social_project_links` l WHERE l.`publicationId`=s.`id`);
