-- CoreWords — MariaDB 11.4
-- Контент словарей отдельно от прогресса. Одно слово — одна строка;
-- связь с Oxford = членство в dictionaries.id LIKE 'oxford%'.
-- Личные словари/слова: owner_user_id; «в обучении» — user_dictionary_state.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `CoreWords`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `CoreWords`;

DROP TABLE IF EXISTS `word_relations`;
DROP TABLE IF EXISTS `auth_attempts`;
DROP TABLE IF EXISTS `user_sessions`;
DROP TABLE IF EXISTS `user_dictionary_state`;
DROP TABLE IF EXISTS `daily_stats`;
DROP TABLE IF EXISTS `word_progress`;
DROP TABLE IF EXISTS `user_settings`;
DROP TABLE IF EXISTS `dictionary_words`;
DROP TABLE IF EXISTS `words`;
DROP TABLE IF EXISTS `dictionaries`;
DROP TABLE IF EXISTS `users`;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(190) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `display_name` VARCHAR(40) NOT NULL DEFAULT '',
  `status` ENUM('active','blocked') NOT NULL DEFAULT 'active',
  `last_login_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dictionaries` (
  `id` VARCHAR(64) NOT NULL,
  `owner_user_id` INT UNSIGNED NULL DEFAULT NULL,
  `name_ru` VARCHAR(255) NOT NULL,
  `kind` ENUM('oxford', 'thematic', 'other') NOT NULL DEFAULT 'thematic',
  `cefr` VARCHAR(8) DEFAULT NULL,
  `is_selected` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `icon_key` VARCHAR(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_kind_selected` (`kind`, `is_selected`),
  KEY `idx_owner` (`owner_user_id`),
  CONSTRAINT `fk_dict_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `words` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner_user_id` INT UNSIGNED NULL DEFAULT NULL,
  `lemma` VARCHAR(255) NOT NULL,
  `rus` TEXT,
  `transcription` VARCHAR(512) DEFAULT NULL,
  `pos` INT UNSIGNED DEFAULT NULL,
  `examples_rus` JSON DEFAULT NULL,
  `picture_source` VARCHAR(32) DEFAULT NULL,
  `picture_source_id` VARCHAR(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_lemma` (`lemma`),
  KEY `idx_owner` (`owner_user_id`),
  UNIQUE KEY `uniq_owner_lemma` (`owner_user_id`, `lemma`),
  CONSTRAINT `fk_word_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10000000 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dictionary_words` (
  `dictionary_id` VARCHAR(64) NOT NULL,
  `word_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`dictionary_id`, `word_id`),
  KEY `idx_word` (`word_id`),
  CONSTRAINT `fk_dw_dict` FOREIGN KEY (`dictionary_id`) REFERENCES `dictionaries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dw_word` FOREIGN KEY (`word_id`) REFERENCES `words` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_dictionary_state` (
  `user_id` INT UNSIGNED NOT NULL,
  `dictionary_id` VARCHAR(64) NOT NULL,
  `is_selected` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`, `dictionary_id`),
  CONSTRAINT `fk_uds_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_uds_dict` FOREIGN KEY (`dictionary_id`) REFERENCES `dictionaries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `word_progress` (
  `user_id` INT UNSIGNED NOT NULL,
  `word_id` INT UNSIGNED NOT NULL,
  `bucket` ENUM('new', 'learning', 'review', 'relearn') NOT NULL DEFAULT 'new',
  `due_ms` BIGINT NOT NULL,
  `ease` DECIMAL(6,3) NOT NULL DEFAULT 2.500,
  `interval_days` INT NOT NULL DEFAULT 0,
  `step` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `reps` INT UNSIGNED NOT NULL DEFAULT 0,
  `lapses` INT UNSIGNED NOT NULL DEFAULT 0,
  `last_review_ms` BIGINT DEFAULT NULL,
  `mastered` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`, `word_id`),
  KEY `idx_due` (`user_id`, `mastered`, `bucket`, `due_ms`),
  CONSTRAINT `fk_wp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wp_word` FOREIGN KEY (`word_id`) REFERENCES `words` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_settings` (
  `user_id` INT UNSIGNED NOT NULL,
  `setting_key` VARCHAR(64) NOT NULL,
  `setting_value` MEDIUMTEXT,
  PRIMARY KEY (`user_id`, `setting_key`),
  CONSTRAINT `fk_us_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `daily_stats` (
  `user_id` INT UNSIGNED NOT NULL,
  `day` DATE NOT NULL,
  `cards_done` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`, `day`),
  CONSTRAINT `fk_ds_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_sessions` (
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

CREATE TABLE `auth_attempts` (
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

CREATE TABLE `word_relations` (
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

-- Технический аккаунт: прогресс импорта / старой однопользовательской базы.
-- Войти нельзя. Как забрать прогресс — см. README.
INSERT INTO `users` (`id`, `email`, `password_hash`, `display_name`, `status`)
VALUES (
  1,
  'legacy@vocabdesk.local',
  -- Не bcrypt-хеш: password_verify() всегда вернёт false, подобрать пароль нельзя.
  '!disabled',
  '',
  'active'
) ON DUPLICATE KEY UPDATE `id` = `id`;
