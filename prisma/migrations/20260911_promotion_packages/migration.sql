ALTER TABLE `projects` ADD COLUMN `promotion` JSON NULL;
ALTER TABLE `project_proposals` ADD COLUMN `promotion` JSON NULL;
ALTER TABLE `project_proposals` ADD COLUMN `legacyPubliciteit` INTEGER NULL;
UPDATE `project_proposals` pp JOIN `projects` p ON p.id = pp.projectId SET pp.legacyPubliciteit = COALESCE(p.kostenPubliciteit, 650) WHERE p.type <> 'AANKOOP';
