ALTER TABLE housing_alert_rules
  ADD COLUMN searchType VARCHAR(191), ADD COLUMN area VARCHAR(191),
  ADD COLUMN radiusMeters INTEGER, ADD COLUMN centerX DOUBLE, ADD COLUMN centerY DOUBLE;

CREATE TABLE listing_search_jobs (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  ruleId VARCHAR(191) NOT NULL,
  mutationId VARCHAR(191) NOT NULL,
  exchangeObjectId VARCHAR(191) NOT NULL,
  stage VARCHAR(191) NOT NULL DEFAULT 'match',
  nextAttempt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  claim VARCHAR(191), error VARCHAR(191), draftId VARCHAR(191),
  UNIQUE INDEX listing_search_jobs_ruleId_exchangeObjectId_key(ruleId, exchangeObjectId),
  INDEX listing_search_jobs_stage_nextAttempt_idx(stage,nextAttempt),
  FOREIGN KEY (ruleId) REFERENCES housing_alert_rules(id) ON UPDATE CASCADE,
  FOREIGN KEY (mutationId) REFERENCES realworks_object_mutations(id) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
