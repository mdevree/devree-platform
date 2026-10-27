CREATE TABLE `marketing_snapshots` (
  `id` VARCHAR(191) NOT NULL,
  `channelId` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `windowDays` INTEGER NOT NULL,
  `capturedAt` DATETIME(3) NOT NULL,
  `metrics` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `marketing_snapshots_channelId_windowDays_capturedAt_key` (`channelId`, `windowDays`, `capturedAt`),
  INDEX `marketing_snapshots_channelId_windowDays_capturedAt_idx` (`channelId`, `windowDays`, `capturedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
