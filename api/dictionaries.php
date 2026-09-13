<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/http.php';
require_once __DIR__ . '/lib/catalog.php';
require_once __DIR__ . '/lib/settings.php';

require_method('GET', 'POST', 'PUT', 'DELETE');

$uid = api_user_id();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'GET') {
    json_ok(['dictionaries' => catalog_dictionaries($uid)]);
}

$body = json_input();
$action = (string) ($body['action'] ?? $_GET['action'] ?? '');

function dict_normalize_name(mixed $name): string
{
    $name = trim((string) $name);
    if ($name === '' || mb_strlen($name) > 120) {
        json_error('Название словаря — от 1 до 120 символов', 422);
    }
    return $name;
}

function dict_sync_custom_scope(int $userId, string $dictionaryId, bool $selected): void
{
    $prefs = settings_prefs($userId);
    if (($prefs['categoryScopeMode'] ?? 'reword') !== 'custom') {
        return;
    }
    $ids = $prefs['customCategoryIds'] ?? [];
    if (!is_array($ids)) {
        $ids = [];
    }
    $ids = array_values(array_filter(array_map('strval', $ids)));
    $set = array_fill_keys($ids, true);
    if ($selected) {
        $set[$dictionaryId] = true;
    } else {
        unset($set[$dictionaryId]);
    }
    settings_save_prefs($userId, ['customCategoryIds' => array_keys($set)]);
}

if ($action === 'create') {
    $lim = catalog_limits();
    if (catalog_count_custom_dictionaries($uid) >= $lim['maxCustomDictionaries']) {
        json_error('Не больше ' . $lim['maxCustomDictionaries'] . ' личных словарей', 422);
    }
    $name = dict_normalize_name($body['name'] ?? '');
    $icon = trim((string) ($body['iconKey'] ?? ''));
    $icon = $icon !== '' ? mb_substr($icon, 0, 64) : null;
    $id = catalog_new_dictionary_id($uid);
    $stmt = db()->prepare(
        'INSERT INTO dictionaries (id, owner_user_id, name_ru, kind, cefr, is_selected, sort_order, icon_key)
         VALUES (?, ?, ?, \'other\', NULL, 0, 1000, ?)',
    );
    $stmt->execute([$id, $uid, $name, $icon]);
    db()->prepare(
        'INSERT INTO user_dictionary_state (user_id, dictionary_id, is_selected) VALUES (?, ?, 0)',
    )->execute([$uid, $id]);
    json_ok(['dictionary' => catalog_dictionary_card($uid, $id)], 201);
}

if ($action === 'rename') {
    $id = (string) ($body['dictionaryId'] ?? '');
    catalog_require_own_dictionary($uid, $id);
    $name = dict_normalize_name($body['name'] ?? '');
    $icon = array_key_exists('iconKey', $body) ? trim((string) $body['iconKey']) : null;
    if ($icon !== null) {
        $icon = $icon !== '' ? mb_substr($icon, 0, 64) : null;
        db()->prepare('UPDATE dictionaries SET name_ru = ?, icon_key = ? WHERE id = ? AND owner_user_id = ?')
            ->execute([$name, $icon, $id, $uid]);
    } else {
        db()->prepare('UPDATE dictionaries SET name_ru = ? WHERE id = ? AND owner_user_id = ?')
            ->execute([$name, $id, $uid]);
    }
    json_ok(['dictionary' => catalog_dictionary_card($uid, $id)]);
}

if ($action === 'setSelected') {
    $id = (string) ($body['dictionaryId'] ?? '');
    catalog_require_accessible_dictionary($uid, $id);
    $selected = !empty($body['isSelected']);
    db()->prepare(
        'INSERT INTO user_dictionary_state (user_id, dictionary_id, is_selected) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE is_selected = VALUES(is_selected)',
    )->execute([$uid, $id, $selected ? 1 : 0]);
    dict_sync_custom_scope($uid, $id, $selected);
    json_ok(['dictionary' => catalog_dictionary_card($uid, $id)]);
}

if ($action === 'delete') {
    $id = (string) ($body['dictionaryId'] ?? '');
    catalog_require_own_dictionary($uid, $id);
    db()->prepare('DELETE FROM dictionaries WHERE id = ? AND owner_user_id = ?')->execute([$id, $uid]);
    $prefs = settings_prefs($uid);
    $ids = $prefs['customCategoryIds'] ?? [];
    if (is_array($ids) && in_array($id, $ids, true)) {
        settings_save_prefs($uid, [
            'customCategoryIds' => array_values(array_filter($ids, static fn($x) => (string) $x !== $id)),
        ]);
    }
    json_ok(['ok' => true]);
}

if ($action === 'addWords') {
    $id = (string) ($body['dictionaryId'] ?? '');
    catalog_require_own_dictionary($uid, $id);
    $wordIds = $body['wordIds'] ?? [];
    if (!is_array($wordIds) || $wordIds === []) {
        json_error('Укажите wordIds', 422);
    }
    $wordIds = array_values(array_unique(array_filter(array_map('intval', $wordIds))));
    $lim = catalog_limits();
    $have = catalog_count_memberships($uid);
    if ($have + count($wordIds) > $lim['maxMemberships']) {
        json_error('Не больше ' . $lim['maxMemberships'] . ' слов в личных словарях', 422);
    }
    $ins = db()->prepare(
        'INSERT IGNORE INTO dictionary_words (dictionary_id, word_id) VALUES (?, ?)',
    );
    foreach ($wordIds as $wid) {
        if (!catalog_can_see_word($uid, $wid)) {
            json_error('Слово недоступно', 403);
        }
        $ins->execute([$id, $wid]);
    }
    json_ok(['dictionary' => catalog_dictionary_card($uid, $id)]);
}

if ($action === 'removeWords') {
    $id = (string) ($body['dictionaryId'] ?? '');
    catalog_require_own_dictionary($uid, $id);
    $wordIds = $body['wordIds'] ?? [];
    if (!is_array($wordIds) || $wordIds === []) {
        json_error('Укажите wordIds', 422);
    }
    $wordIds = array_values(array_unique(array_filter(array_map('intval', $wordIds))));
    $place = implode(',', array_fill(0, count($wordIds), '?'));
    $stmt = db()->prepare("DELETE FROM dictionary_words WHERE dictionary_id = ? AND word_id IN ({$place})");
    $stmt->execute([$id, ...$wordIds]);
    json_ok(['dictionary' => catalog_dictionary_card($uid, $id)]);
}

json_error('Неизвестное действие');
