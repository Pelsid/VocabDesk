-- VocabDesk: аккаунты, сессии, личные словари и связи слов.
-- Идемпотентно: повторный запуск не ломает схему (MariaDB 10.3+ IF NOT EXISTS).

SET NAMES utf8mb4;

-- 4.1. Пользователи
ALTER TABLE `users`
  MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `email` VARCHAR(190) NOT NULL DEFAULT '' AFTER `id`,
  ADD COLUMN IF NOT EXISTS `password_hash` VARCHAR(255) NOT NULL DEFAULT '' AFTER `email`,
  ADD COLUMN IF NOT EXISTS `display_name` VARCHAR(40) NOT NULL DEFAULT '' AFTER `password_hash`,
  ADD COLUMN IF NOT EXISTS `status` ENUM('active','blocked') NOT NULL DEFAULT 'active' AFTER `display_name`,
  ADD COLUMN IF NOT EXISTS `last_login_at` TIMESTAMP NULL DEFAULT NULL AFTER `status`;

-- Существующая строка id=1 без email: технический аккаунт, войти нельзя.
-- password_hash не является bcrypt-хешем: password_verify() всегда вернёт false.
UPDATE `users`
   SET `email` = 'legacy@vocabdesk.local',
       `password_hash` = '!disabled',
       `display_name` = IFNULL(`display_name`, ''),
       `status` = IFNULL(`status`, 'active')
 WHERE `id` = 1
   AND (`email` = '' OR `email` IS NULL);

ALTER TABLE `users`
  ADD UNIQUE KEY IF NOT EXISTS `uniq_email` (`email`);

-- 4.2. Сессии (selector + sha256(validator))
CREATE TABLE IF NOT EXISTS `user_sessions` (
  `selector` CHAR(32) NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`selector`),
  KEY `idx_user` (`user_id`),
  KEY `idx_expires` (`expires_at`),
  CONSTRAINT `fk_sess_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4.3. Защита от перебора
CREATE TABLE IF NOT EXISTS `auth_attempts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ip` VARBINARY(16) DEFAULT NULL,
  `email` VARCHAR(190) DEFAULT NULL,
  `kind` ENUM('login','register') NOT NULL DEFAULT 'login',
  `at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_kind_ip_at` (`kind`, `ip`, `at`),
  KEY `idx_ip_at` (`ip`, `at`),
  KEY `idx_email_at` (`email`, `at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `auth_attempts`
  ADD COLUMN IF NOT EXISTS `kind` ENUM('login','register') NOT NULL DEFAULT 'login' AFTER `email`,
  ADD KEY IF NOT EXISTS `idx_kind_ip_at` (`kind`, `ip`, `at`);

-- 4.4. Владелец словаря и per-user выбор
ALTER TABLE `dictionaries`
  ADD COLUMN IF NOT EXISTS `owner_user_id` INT UNSIGNED NULL DEFAULT NULL AFTER `id`;

ALTER TABLE `dictionaries`
  ADD KEY IF NOT EXISTS `idx_owner` (`owner_user_id`);

-- FK: добавляем только если ещё нет
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'dictionaries'
     AND CONSTRAINT_NAME = 'fk_dict_owner'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE `dictionaries` ADD CONSTRAINT `fk_dict_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE',
  'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `user_dictionary_state` (
  `user_id` INT UNSIGNED NOT NULL,
  `dictionary_id` VARCHAR(64) NOT NULL,
  `is_selected` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`, `dictionary_id`),
  CONSTRAINT `fk_uds_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_uds_dict` FOREIGN KEY (`dictionary_id`) REFERENCES `dictionaries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Дефолтный набор пользователя 1: глобальный is_selected + customCategoryIds из prefs
INSERT IGNORE INTO `user_dictionary_state` (`user_id`, `dictionary_id`, `is_selected`)
SELECT 1, `id`, `is_selected` FROM `dictionaries` WHERE `owner_user_id` IS NULL;

INSERT INTO `user_dictionary_state` (`user_id`, `dictionary_id`, `is_selected`)
SELECT 1, jt.dict_id, 1
  FROM `user_settings` us
  JOIN JSON_TABLE(
         us.setting_value,
         '$.customCategoryIds[*]'
         COLUMNS (`dict_id` VARCHAR(64) PATH '$')
       ) AS jt
 WHERE us.user_id = 1
   AND us.setting_key = 'prefs'
   AND jt.dict_id IS NOT NULL
   AND jt.dict_id <> ''
    ON DUPLICATE KEY UPDATE `is_selected` = 1;

-- 4.5. Пользовательские слова
ALTER TABLE `words`
  MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `words`
  ADD COLUMN IF NOT EXISTS `owner_user_id` INT UNSIGNED NULL DEFAULT NULL AFTER `id`;

ALTER TABLE `words`
  ADD KEY IF NOT EXISTS `idx_owner` (`owner_user_id`);

ALTER TABLE `words`
  ADD UNIQUE KEY IF NOT EXISTS `uniq_owner_lemma` (`owner_user_id`, `lemma`);

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'words'
     AND CONSTRAINT_NAME = 'fk_word_owner'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE `words` ADD CONSTRAINT `fk_word_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE',
  'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @max_wid := (SELECT IFNULL(MAX(`id`), 0) FROM `words`);
SET @next_wid := IF(@max_wid >= 10000000, @max_wid + 1, 10000000);
SET @sql := CONCAT('ALTER TABLE `words` AUTO_INCREMENT = ', @next_wid);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4.6. Персональные связи слов
CREATE TABLE IF NOT EXISTS `word_relations` (
  `user_id` INT UNSIGNED NOT NULL,
  `word_id` INT UNSIGNED NOT NULL,
  `related_word_id` INT UNSIGNED NOT NULL,
  `relation` ENUM('related','synonym','antonym','form','collocation') NOT NULL DEFAULT 'related',
  `note` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `word_id`, `related_word_id`, `relation`),
  KEY `idx_related` (`user_id`, `related_word_id`),
  CONSTRAINT `fk_wr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wr_word` FOREIGN KEY (`word_id`) REFERENCES `words` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wr_related` FOREIGN KEY (`related_word_id`) REFERENCES `words` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
