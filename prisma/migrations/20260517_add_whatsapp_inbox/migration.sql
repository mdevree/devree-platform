-- CreateEnum
CREATE TABLE IF NOT EXISTS `_prisma_migrations` (
  `id`                    VARCHAR(36)  NOT NULL,
  `checksum`              VARCHAR(64)  NOT NULL,
  `finished_at`           DATETIME(3)  NULL,
  `migration_name`        VARCHAR(255) NOT NULL,
  `logs`                  TEXT         NULL,
  `rolled_back_at`        DATETIME(3)  NULL,
  `started_at`            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `applied_steps_count`   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
);

CREATE TABLE `wa_conversations` (
  `id`              VARCHAR(191) NOT NULL,
  `waPhone`         VARCHAR(191) NOT NULL,
  `waName`          VARCHAR(191) NULL,
  `mauticContactId` INTEGER      NULL,
  `status`          ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  `lastMessageAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`       DATETIME(3)  NOT NULL,

  INDEX `wa_conversations_waPhone_idx` (`waPhone`),
  INDEX `wa_conversations_status_idx` (`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `wa_messages` (
  `id`             VARCHAR(191) NOT NULL,
  `conversationId` VARCHAR(191) NOT NULL,
  `direction`      ENUM('INBOUND', 'OUTBOUND') NOT NULL,
  `body`           TEXT         NOT NULL,
  `mediaUrl`       VARCHAR(191) NULL,
  `mediaType`      VARCHAR(191) NULL,
  `evolutionMsgId` VARCHAR(191) NULL,
  `readAt`         DATETIME(3)  NULL,
  `createdAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `wa_messages_evolutionMsgId_key` (`evolutionMsgId`),
  INDEX `wa_messages_conversationId_idx` (`conversationId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `wa_messages` ADD CONSTRAINT `wa_messages_conversationId_fkey`
  FOREIGN KEY (`conversationId`) REFERENCES `wa_conversations` (`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
