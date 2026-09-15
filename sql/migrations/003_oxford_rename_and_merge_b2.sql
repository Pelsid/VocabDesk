-- CoreWords: имена Oxford + слияние двух B2 в Oxford 4000 - B2.
-- Идемпотентно. JSON prefs (customCategoryIds) правит api/tools/apply-migration-003.php.

SET NAMES utf8mb4;

UPDATE `dictionaries` SET `name_ru` = 'Oxford 1000 - A1' WHERE `id` = 'oxford3000_a1';
UPDATE `dictionaries` SET `name_ru` = 'Oxford 2000 - A2' WHERE `id` = 'oxford3000_a2';
UPDATE `dictionaries` SET `name_ru` = 'Oxford 4000 - B2' WHERE `id` = 'oxford3000_b2';
UPDATE `dictionaries` SET `name_ru` = 'Oxford 6000 - C1' WHERE `id` = 'oxford5000_c1';

INSERT IGNORE INTO `dictionary_words` (`dictionary_id`, `word_id`)
SELECT 'oxford3000_b2', `word_id` FROM `dictionary_words` WHERE `dictionary_id` = 'oxford5000_b2';

UPDATE `dictionaries` dest
  JOIN `dictionaries` src ON src.`id` = 'oxford5000_b2'
   SET dest.`is_selected` = IF(dest.`is_selected` + src.`is_selected` > 0, 1, 0)
 WHERE dest.`id` = 'oxford3000_b2';

INSERT IGNORE INTO `user_dictionary_state` (`user_id`, `dictionary_id`, `is_selected`)
SELECT `user_id`, 'oxford3000_b2', `is_selected`
  FROM `user_dictionary_state`
 WHERE `dictionary_id` = 'oxford5000_b2';

UPDATE `user_dictionary_state` dest
  JOIN `user_dictionary_state` src
    ON src.`user_id` = dest.`user_id` AND src.`dictionary_id` = 'oxford5000_b2'
   SET dest.`is_selected` = IF(dest.`is_selected` + src.`is_selected` > 0, 1, 0)
 WHERE dest.`dictionary_id` = 'oxford3000_b2';

DELETE FROM `dictionaries` WHERE `id` = 'oxford5000_b2';
