<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/http.php';
require_once __DIR__ . '/lib/catalog.php';
require_once __DIR__ . '/lib/progress_svc.php';

require_method('GET');

$uid = api_user_id();
json_ok([
    'dictionaries' => catalog_dictionaries($uid),
    'dictionaryWordIds' => catalog_word_ids_by_dictionary($uid),
    'progress' => progress_snapshot($uid),
    'daily' => daily_payload($uid),
    'hasGroqKey' => settings_has_groq_key($uid),
    'orphanWordCount' => catalog_orphan_count($uid),
]);
