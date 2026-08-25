ALTER TABLE `appointment_confirmations`
    ADD COLUMN `woningImageUrl` TEXT NULL,
    ADD COLUMN `videoPosterIndex` INTEGER NOT NULL DEFAULT 0;
