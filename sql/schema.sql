-- VocabDesk / CoreWords — MariaDB 11.4
-- Контент словарей отдельно от прогресса. Одно слово — одна строка;
-- связь с Oxford = членство в dictionaries.id LIKE 'oxford%'.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `CoreWords`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `CoreWords`;

DROP TABLE IF EXISTS `daily_stats`;
DROP TABLE IF EXISTS `word_progress`;
DROP TABLE IF EXISTS `user_settings`;
DROP TABLE IF EXISTS `dictionary_words`;
DROP TABLE IF EXISTS `words`;
DROP TABLE IF EXISTS `dictionaries`;
DROP TABLE IF EXISTS `users`;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE `users` (
  `id` INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dictionaries` (
  `id` VARCHAR(64) NOT NULL,
  `name_ru` VARCHAR(255) NOT NULL,
  `kind` ENUM('oxford', 'thematic', 'other') NOT NULL DEFAULT 'thematic',
  `cefr` VARCHAR(8) DEFAULT NULL,
  `is_selected` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `icon_key` VARCHAR(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_kind_selected` (`kind`, `is_selected`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `words` (
  `id` INT UNSIGNED NOT NULL,
  `lemma` VARCHAR(255) NOT NULL,
  `rus` TEXT,
  `transcription` VARCHAR(512) DEFAULT NULL,
  `pos` INT UNSIGNED DEFAULT NULL,
  `examples_rus` JSON DEFAULT NULL,
  `picture_source` VARCHAR(32) DEFAULT NULL,
  `picture_source_id` VARCHAR(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_lemma` (`lemma`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dictionary_words` (
  `dictionary_id` VARCHAR(64) NOT NULL,
  `word_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`dictionary_id`, `word_id`),
  KEY `idx_word` (`word_id`),
  CONSTRAINT `fk_dw_dict` FOREIGN KEY (`dictionary_id`) REFERENCES `dictionaries` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dw_word` FOREIGN KEY (`word_id`) REFERENCES `words` (`id`) ON DELETE CASCADE
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

INSERT INTO `users` (`id`) VALUES (1)
  ON DUPLICATE KEY UPDATE `id` = `id`;
