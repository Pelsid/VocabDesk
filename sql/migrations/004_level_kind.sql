-- Уровни A1–C2 вместо Oxford: сначала расширяем ENUM, данные заменяет
-- api/tools/import-thematic.php и в конце сужает ENUM до level/thematic/other.

ALTER TABLE `dictionaries`
  MODIFY `kind` ENUM('oxford', 'level', 'thematic', 'other') NOT NULL DEFAULT 'thematic';
