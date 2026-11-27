CREATE TABLE `wa_web_push_devices` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(36) NOT NULL,
    `endpoint` TEXT NOT NULL,
    `endpointHash` CHAR(64) NOT NULL,
    `p256dh` VARCHAR(87) NOT NULL,
    `authKey` VARCHAR(22) NOT NULL,
    `officeSince` DATETIME(3) NULL,
    `personalSince` DATETIME(3) NULL,
    `lastTestAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `wa_web_push_devices_endpointHash_key` (`endpointHash`),
    INDEX `wa_web_push_devices_userId_sessionId_idx` (`userId`, `sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `wa_web_push_deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(36) NOT NULL,
    `draftRef` VARCHAR(130) NOT NULL,
    `state` VARCHAR(10) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextTry` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `wa_web_push_deliveries_deviceId_draftRef_key` (`deviceId`, `draftRef`),
    INDEX `wa_web_push_deliveries_state_nextTry_idx` (`state`, `nextTry`),
    INDEX `wa_web_push_deliveries_createdAt_idx` (`createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `wa_web_push_deliveries_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `wa_web_push_devices` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
