CREATE TABLE `wa_shared_pages` (
    `contactId` INTEGER NOT NULL,
    `pageHash` CHAR(64) NOT NULL,
    PRIMARY KEY (`contactId`, `pageHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
