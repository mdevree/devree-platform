-- AlterTable: maak postId nullable (wordt ingevuld nadat de Facebook post live is)
ALTER TABLE `facebook_triggers` MODIFY COLUMN `postId` VARCHAR(191) NULL;
