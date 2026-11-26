CREATE TABLE `project_etalages` (
  `projectId` VARCHAR(191) NOT NULL,
  `revision` INTEGER NOT NULL DEFAULT 1,
  `document` JSON NOT NULL,
  PRIMARY KEY (`projectId`),
  CONSTRAINT `project_etalages_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
