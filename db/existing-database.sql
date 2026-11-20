-- Run ONCE against an existing `iskolaraid` database created by the WinForms app,
-- then start the API with Database__AutoMigrate=false (or true: it will see the baseline row and do nothing).
--
-- Back up first:  mysqldump iskolaraid > iskolaraid-backup.sql
--
-- 1. Passwords were stored in plaintext. The API hashes them (and rehashes legacy values on first login),
--    so the column must be wide enough for a hash.
ALTER TABLE users MODIFY password VARCHAR(255) NOT NULL;

-- 2. The registration form validated the Student ID but never stored it. Add the column (additive, nullable).
SET @has := (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'scholar_registrations' AND column_name = 'student_id');
SET @sql := IF(@has = 0, 'ALTER TABLE scholar_registrations ADD COLUMN student_id VARCHAR(50) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Mark the EF Core baseline as applied so the API does not try to re-create the existing tables.
CREATE TABLE IF NOT EXISTS `__EFMigrationsHistory` (
  `MigrationId` varchar(150) CHARACTER SET utf8mb4 NOT NULL,
  `ProductVersion` varchar(32) CHARACTER SET utf8mb4 NOT NULL,
  PRIMARY KEY (`MigrationId`)
) CHARACTER SET=utf8mb4;
INSERT IGNORE INTO `__EFMigrationsHistory` (`MigrationId`, `ProductVersion`) VALUES ('20261120062920_InitialCreate', '9.0.0');

-- Optional hardening (run only if there are no duplicates; each fails harmlessly if the index already exists):
-- CREATE UNIQUE INDEX ix_users_username ON users (username);
-- CREATE UNIQUE INDEX ix_scholars_scholar_number ON scholars (scholar_number);
