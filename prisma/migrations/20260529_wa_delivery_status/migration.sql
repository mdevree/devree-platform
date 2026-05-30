-- AlterTable
ALTER TABLE `wa_messages`
    ADD COLUMN `deliveryStatus` ENUM('SENT', 'FAILED') NULL,
    ADD COLUMN `deliveryError` TEXT NULL;
