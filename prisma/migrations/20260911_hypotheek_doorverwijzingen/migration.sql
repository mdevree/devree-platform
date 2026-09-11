-- AlterTable
ALTER TABLE `leads` MODIFY `status` ENUM('CONTACT', 'KIJKER', 'ZOEKER', 'CONVERTED', 'INACTIEF') NOT NULL DEFAULT 'KIJKER';

-- CreateTable
CREATE TABLE `hypotheek_doorverwijzingen` (
    `id` VARCHAR(191) NOT NULL,
    `adviseurId` VARCHAR(191) NOT NULL,
    `datum` DATE NULL,
    `herkomst` VARCHAR(191) NOT NULL DEFAULT 'handmatig',
    `notities` TEXT NULL,
    `geregistreerdDoor` VARCHAR(191) NOT NULL,
    `hypotheekAfgesloten` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `hypotheek_doorverwijzingen_adviseurId_datum_idx`(`adviseurId`, `datum`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hypotheek_deelnames` (
    `id` VARCHAR(191) NOT NULL,
    `doorverwijzingId` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NOT NULL,
    `adviseurId` VARCHAR(191) NOT NULL,
    `hoofdcontact` BOOLEAN NOT NULL DEFAULT false,

    INDEX `hypotheek_deelnames_doorverwijzingId_idx`(`doorverwijzingId`),
    INDEX `hypotheek_deelnames_leadId_idx`(`leadId`),
    UNIQUE INDEX `hypotheek_deelnames_adviseurId_leadId_key`(`adviseurId`, `leadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hypotheek_adviseur_emails` (
    `email` VARCHAR(191) NOT NULL,
    `adviseurId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`email`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hypotheek_mail_events` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `mailbox` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'review',
    `reden` TEXT NOT NULL,
    `onderwerp` VARCHAR(191) NOT NULL,
    `passage` TEXT NOT NULL,
    `afzender` VARCHAR(191) NOT NULL,
    `ontvangers` JSON NOT NULL,
    `datum` DATE NULL,
    `adviseurId` VARCHAR(191) NULL,
    `contactVoorstel` JSON NULL,
    `doorverwijzingId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `hypotheek_mail_events_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `hypotheek_mail_events_messageId_mailbox_key`(`messageId`, `mailbox`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hypotheek_instellingen` (
    `id` VARCHAR(191) NOT NULL,
    `automatisch` BOOLEAN NOT NULL DEFAULT false,
    `actiefVanaf` DATETIME(3) NULL,
    `afzenders` JSON NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `hypotheek_doorverwijzingen` ADD CONSTRAINT `hypotheek_doorverwijzingen_adviseurId_fkey` FOREIGN KEY (`adviseurId`) REFERENCES `hypotheek_adviseurs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hypotheek_deelnames` ADD CONSTRAINT `hypotheek_deelnames_doorverwijzingId_fkey` FOREIGN KEY (`doorverwijzingId`) REFERENCES `hypotheek_doorverwijzingen`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hypotheek_deelnames` ADD CONSTRAINT `hypotheek_deelnames_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hypotheek_adviseur_emails` ADD CONSTRAINT `hypotheek_adviseur_emails_adviseurId_fkey` FOREIGN KEY (`adviseurId`) REFERENCES `hypotheek_adviseurs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hypotheek_mail_events` ADD CONSTRAINT `hypotheek_mail_events_doorverwijzingId_fkey` FOREIGN KEY (`doorverwijzingId`) REFERENCES `hypotheek_doorverwijzingen`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


SET SESSION group_concat_max_len = 65535;
-- Additive backfill: one existing lead equals one referral, independent of route count.
INSERT INTO hypotheek_instellingen (id, automatisch, afzenders) VALUES ('default', false, JSON_ARRAY('info@devreemakelaardij.nl','melvin@devreemakelaardij.nl','makelaar@devreemakelaardij.nl','erling@devreemakelaardij.nl'));
INSERT INTO hypotheek_doorverwijzingen (id, adviseurId, datum, herkomst, notities, geregistreerdDoor, hypotheekAfgesloten, createdAt, updatedAt)
SELECT CONCAT('legacy_',l.id), l.hypotheekAdviseurId, DATE(l.hypotheekAdviseurDatum), 'migratie',
 CONCAT(COALESCE(l.notities,''), '\nHistorie:\n',COALESCE((SELECT GROUP_CONCAT(CONCAT(r.routedAt,': ',COALESCE(r.notities,'')) SEPARATOR '\n') FROM lead_routes r WHERE r.leadId=l.id AND r.routeType='hypotheekadviseur'),'')),
 'migratie', l.hypotheekAfgesloten, l.createdAt, NOW(3) FROM leads l WHERE l.hypotheekAdviseurId IS NOT NULL;
INSERT INTO hypotheek_deelnames (id,doorverwijzingId,leadId,adviseurId,hoofdcontact)
SELECT CONCAT('legacy_',id), CONCAT('legacy_',id), id, hypotheekAdviseurId, true FROM leads WHERE hypotheekAdviseurId IS NOT NULL;
INSERT IGNORE INTO hypotheek_adviseur_emails (email,adviseurId) SELECT LOWER(TRIM(email)),id FROM hypotheek_adviseurs WHERE email IS NOT NULL AND email<>'';
INSERT IGNORE INTO hypotheek_adviseur_emails (email,adviseurId) SELECT 'frans@vwadvies.nl',id FROM hypotheek_adviseurs WHERE LOWER(email)='info@vwadvies.nl';
