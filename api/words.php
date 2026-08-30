<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/http.php';
require_once __DIR__ . '/lib/catalog.php';
require_once __DIR__ . '/lib/settings.php';

require_method('GET');

$action = (string) ($_GET['action'] ?? 'list');
$uid = api_user_id();

if ($action === 'quiz_rus') {
    $scope = (string) ($_GET['scope'] ?? 'selected');
    $categoryId = isset($_GET['categoryId']) && $_GET['categoryId'] !== '' ? (string) $_GET['categoryId'] : null;
    $exclude = (int) ($_GET['exclude'] ?? 0);
    $limit = max(1, min(80, (int) ($_GET['limit'] ?? 48)));
    $ids = catalog_scope_ids($scope, $categoryId, settings_prefs($uid));
    json_ok(['rus' => catalog_quiz_rus($ids, $exclude, $limit)]);
}

if ($action === 'search') {
    $q = (string) ($_GET['q'] ?? '');
    json_ok(['words' => catalog_search_words($q, 60)]);
}

if ($action === 'ids') {
    $raw = (string) ($_GET['ids'] ?? '');
    $ids = array_filter(array_map('intval', explode(',', $raw)));
    json_ok(['words' => catalog_words_by_ids($ids)]);
}

$dictionaryId = (string) ($_GET['dictionaryId'] ?? '');
if ($dictionaryId === '') {
    json_error('Укажите dictionaryId, action=search, action=ids или action=quiz_rus');
}
$q = (string) ($_GET['q'] ?? '');
json_ok(['words' => catalog_words_in_dictionary($dictionaryId, $q)]);
