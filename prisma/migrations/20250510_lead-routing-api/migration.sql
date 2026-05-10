-- Lead Routing API: nieuwe enums, velden en LeadRoute tabel

-- Enums (MySQL: MODIFY via ENUM kolom definitie)

ALTER TABLE `leads`
  ADD COLUMN `prioriteit` ENUM('LAAG', 'NORMAAL', 'HOOG', 'URGENT') NOT NULL DEFAULT 'NORMAAL',
  ADD COLUMN `source` ENUM('WEBSITE', 'SOCIAL', 'TELEFOON', 'EMAIL', 'DOORVERWIJZING', 'HANDMATIG', 'API') NULL,
  ADD COLUMN `tags` JSON NULL;

CREATE INDEX `leads_prioriteit_idx` ON `leads`(`prioriteit`);
CREATE INDEX `leads_source_idx` ON `leads`(`source`);

-- LeadRoute tabel voor generieke routeringshistorie
CREATE TABLE `lead_routes` (
  `id`            VARCHAR(191) NOT NULL,
  `leadId`        VARCHAR(191) NOT NULL,
  `routeType`     VARCHAR(191) NOT NULL,
  `targetId`      VARCHAR(191) NULL,
  `targetNaam`    VARCHAR(191) NULL,
  `targetBedrijf` VARCHAR(191) NULL,
  `notities`      TEXT NULL,
  `routedById`    VARCHAR(191) NULL,
  `routedAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `lead_routes_leadId_idx`(`leadId`),
  INDEX `lead_routes_routeType_idx`(`routeType`),
  INDEX `lead_routes_routedAt_idx`(`routedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `lead_routes`
  ADD CONSTRAINT `lead_routes_leadId_fkey`
  FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
