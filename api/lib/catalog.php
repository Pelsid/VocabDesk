<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';

function catalog_oxford_levels_for_word(int $wordId): array
{
    static $cache = null;
    if ($cache === null) {
        $cache = [];
        $sql = "SELECT dw.word_id, d.cefr
                FROM dictionary_words dw
                JOIN dictionaries d ON d.id = dw.dictionary_id
                WHERE d.kind = 'oxford' AND d.cefr IS NOT NULL AND d.owner_user_id IS NULL";
        foreach (db()->query($sql) as $row) {
            $wid = (int) $row['word_id'];
            $cefr = (string) $row['cefr'];
            $cache[$wid] ??= [];
            if (!in_array($cefr, $cache[$wid], true)) {
                $cache[$wid][] = $cefr;
            }
        }
    }
    return $cache[$wordId] ?? [];
}

function catalog_word_visible_sql(): string
{
    return '(w.owner_user_id IS NULL OR w.owner_user_id = ?)';
}

function catalog_dict_visible_sql(string $alias = 'd'): string
{
    return "({$alias}.owner_user_id IS NULL OR {$alias}.owner_user_id = ?)";
}

function catalog_can_see_word(int $userId, int $wordId): bool
{
    $stmt = db()->prepare(
        'SELECT 1 FROM words w WHERE w.id = ? AND ' . catalog_word_visible_sql(),
    );
    $stmt->execute([$wordId, $userId]);
    return (bool) $stmt->fetchColumn();
}

function catalog_require_word(int $userId, int $wordId): array
{
    $stmt = db()->prepare(
        'SELECT * FROM words w WHERE w.id = ? AND ' . catalog_word_visible_sql(),
    );
    $stmt->execute([$wordId, $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        json_error('Слово не найдено', 404);
    }
    return $row;
}

function catalog_accessible_dictionary(int $userId, string $dictionaryId): ?array
{
    $stmt = db()->prepare(
        'SELECT * FROM dictionaries d WHERE d.id = ? AND ' . catalog_dict_visible_sql('d'),
    );
    $stmt->execute([$dictionaryId, $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function catalog_require_accessible_dictionary(int $userId, string $dictionaryId): array
{
    $row = catalog_accessible_dictionary($userId, $dictionaryId);
    if (!$row) {
        json_error('Словарь не найден', 404);
    }
    return $row;
}

function catalog_require_own_dictionary(int $userId, string $dictionaryId): array
{
    $row = catalog_require_accessible_dictionary($userId, $dictionaryId);
    if ((int) ($row['owner_user_id'] ?? 0) !== $userId) {
        json_error('Это не ваш словарь', 403);
    }
    return $row;
}

function catalog_word_dictionary_ids_map(int $userId, array $wordIds): array
{
    $wordIds = array_values(array_unique(array_filter(array_map('intval', $wordIds))));
    if ($wordIds === []) {
        return [];
    }
    $map = [];
    foreach (array_chunk($wordIds, 400) as $chunk) {
        $place = implode(',', array_fill(0, count($chunk), '?'));
        $sql = "SELECT dw.word_id, dw.dictionary_id
                  FROM dictionary_words dw
                  JOIN dictionaries d ON d.id = dw.dictionary_id
                 WHERE dw.word_id IN ({$place})
                   AND " . catalog_dict_visible_sql('d');
        $stmt = db()->prepare($sql);
        $stmt->execute([...$chunk, $userId]);
        foreach ($stmt as $row) {
            $wid = (int) $row['word_id'];
            $map[$wid] ??= [];
            $map[$wid][] = (string) $row['dictionary_id'];
        }
    }
    return $map;
}

function catalog_map_word(array $r, int $userId = 0, array $dictionaryIds = []): array
{
    $id = (int) $r['id'];
    $owner = $r['owner_user_id'] ?? null;
    return [
        'id' => $id,
        'word' => (string) $r['lemma'],
        'rus' => $r['rus'] !== null && $r['rus'] !== '' ? (string) $r['rus'] : null,
        'transcription' => $r['transcription'] !== null && $r['transcription'] !== '' ? (string) $r['transcription'] : null,
        'qRec' => 0,
        'qRep' => 0,
        'examplesRus' => $r['examples_rus'] !== null ? (is_string($r['examples_rus']) ? $r['examples_rus'] : json_encode($r['examples_rus'], JSON_UNESCAPED_UNICODE)) : null,
        'pictureId' => null,
        'picSource' => $r['picture_source'] !== null && $r['picture_source'] !== '' ? (string) $r['picture_source'] : null,
        'picSourceId' => $r['picture_source_id'] !== null && $r['picture_source_id'] !== '' ? (string) $r['picture_source_id'] : null,
        'picBlobLen' => 0,
        'oxfordLevels' => catalog_oxford_levels_for_word($id),
        'isOwn' => $owner !== null && (int) $owner === $userId,
        'dictionaryIds' => $dictionaryIds,
    ];
}

function catalog_map_words(int $userId, array $rows): array
{
    $ids = [];
    foreach ($rows as $r) {
        $ids[] = (int) $r['id'];
    }
    $map = catalog_word_dictionary_ids_map($userId, $ids);
    $out = [];
    foreach ($rows as $r) {
        $id = (int) $r['id'];
        $out[] = catalog_map_word($r, $userId, $map[$id] ?? []);
    }
    return $out;
}

function catalog_dictionaries(int $userId): array
{
    $sql = "SELECT
              d.id, d.name_ru, d.kind, d.cefr, d.sort_order, d.icon_key, d.owner_user_id,
              COALESCE(uds.is_selected, 0) AS is_selected,
              COUNT(DISTINCT dw.word_id) AS word_count,
              SUM(CASE WHEN wp.mastered = 1 OR wp.bucket = 'review' THEN 1 ELSE 0 END) AS learned_count,
              SUM(CASE WHEN ox.word_id IS NOT NULL THEN 1 ELSE 0 END) AS oxford_overlap
            FROM dictionaries d
            LEFT JOIN user_dictionary_state uds ON uds.dictionary_id = d.id AND uds.user_id = ?
            LEFT JOIN dictionary_words dw ON dw.dictionary_id = d.id
            LEFT JOIN word_progress wp ON wp.word_id = dw.word_id AND wp.user_id = ?
            LEFT JOIN (
              SELECT DISTINCT dw2.word_id
              FROM dictionary_words dw2
              JOIN dictionaries d2 ON d2.id = dw2.dictionary_id AND d2.kind = 'oxford' AND d2.owner_user_id IS NULL
            ) ox ON ox.word_id = dw.word_id AND d.kind <> 'oxford'
            WHERE d.owner_user_id IS NULL OR d.owner_user_id = ?
            GROUP BY d.id
            ORDER BY (d.owner_user_id IS NULL), d.sort_order, d.name_ru";
    $stmt = db()->prepare($sql);
    $stmt->execute([$userId, $userId, $userId]);
    $out = [];
    foreach ($stmt as $r) {
        $isCustom = $r['owner_user_id'] !== null;
        $out[] = [
            'id' => (string) $r['id'],
            'name' => (string) $r['name_ru'],
            'isCustom' => $isCustom,
            'canEdit' => $isCustom,
            'isSelected' => (int) $r['is_selected'] === 1,
            'customIcon' => $r['icon_key'] !== null && $r['icon_key'] !== '' ? (string) $r['icon_key'] : null,
            'wordCount' => (int) $r['word_count'],
            'learnedCount' => (int) $r['learned_count'],
            'kind' => (string) $r['kind'],
            'cefr' => $r['cefr'] !== null && $r['cefr'] !== '' ? (string) $r['cefr'] : null,
            'oxfordOverlap' => (int) $r['oxford_overlap'],
        ];
    }
    return $out;
}

function catalog_dictionary_card(int $userId, string $id): ?array
{
    foreach (catalog_dictionaries($userId) as $d) {
        if ($d['id'] === $id) {
            return $d;
        }
    }
    return null;
}

function catalog_word_ids_by_dictionary(int $userId): array
{
    $sql = 'SELECT dw.dictionary_id, dw.word_id
              FROM dictionary_words dw
              JOIN dictionaries d ON d.id = dw.dictionary_id
             WHERE d.owner_user_id IS NULL OR d.owner_user_id = ?';
    $stmt = db()->prepare($sql);
    $stmt->execute([$userId]);
    $map = [];
    foreach ($stmt as $row) {
        $did = (string) $row['dictionary_id'];
        $map[$did] ??= [];
        $map[$did][] = (int) $row['word_id'];
    }
    return $map;
}

function catalog_scope_ids(int $userId, string $scope, ?string $categoryId, array $prefs): array
{
    if ($scope === 'category') {
        if (!$categoryId) {
            return [];
        }
        if (!catalog_accessible_dictionary($userId, $categoryId)) {
            return [];
        }
        $stmt = db()->prepare(
            'SELECT dw.word_id FROM dictionary_words dw
             JOIN words w ON w.id = dw.word_id
             WHERE dw.dictionary_id = ? AND ' . catalog_word_visible_sql(),
        );
        $stmt->execute([$categoryId, $userId]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }
    if (($prefs['categoryScopeMode'] ?? 'reword') === 'custom') {
        $ids = $prefs['customCategoryIds'] ?? [];
        if (!is_array($ids) || $ids === []) {
            return [];
        }
        $ids = array_values(array_filter(array_map('strval', $ids)));
        if ($ids === []) {
            return [];
        }
        $place = implode(',', array_fill(0, count($ids), '?'));
        $sql = "SELECT DISTINCT dw.word_id
                  FROM dictionary_words dw
                  JOIN dictionaries d ON d.id = dw.dictionary_id
                  JOIN words w ON w.id = dw.word_id
                 WHERE dw.dictionary_id IN ({$place})
                   AND " . catalog_dict_visible_sql('d') . '
                   AND ' . catalog_word_visible_sql();
        $stmt = db()->prepare($sql);
        $stmt->execute([...$ids, $userId, $userId]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }
    $stmt = db()->prepare(
        'SELECT DISTINCT dw.word_id
           FROM dictionary_words dw
           JOIN dictionaries d ON d.id = dw.dictionary_id
           JOIN user_dictionary_state uds ON uds.dictionary_id = d.id AND uds.user_id = ? AND uds.is_selected = 1
           JOIN words w ON w.id = dw.word_id
          WHERE ' . catalog_dict_visible_sql('d') . ' AND ' . catalog_word_visible_sql(),
    );
    $stmt->execute([$userId, $userId, $userId]);
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function catalog_words_by_ids(array $ids, int $userId): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if ($ids === []) {
        return [];
    }
    $rowsById = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $place = implode(',', array_fill(0, count($chunk), '?'));
        $stmt = db()->prepare(
            "SELECT * FROM words w WHERE id IN ({$place}) AND " . catalog_word_visible_sql(),
        );
        $stmt->execute([...$chunk, $userId]);
        foreach ($stmt as $r) {
            $rowsById[(int) $r['id']] = $r;
        }
    }
    $ordered = [];
    foreach ($ids as $id) {
        if (isset($rowsById[$id])) {
            $ordered[] = $rowsById[$id];
        }
    }
    return catalog_map_words($userId, $ordered);
}

function catalog_words_in_dictionary(string $dictionaryId, string $search, int $userId): array
{
    catalog_require_accessible_dictionary($userId, $dictionaryId);
    $sql = 'SELECT w.* FROM words w
            JOIN dictionary_words dw ON dw.word_id = w.id
            WHERE dw.dictionary_id = ? AND ' . catalog_word_visible_sql();
    $params = [$dictionaryId, $userId];
    if (trim($search) !== '') {
        $sql .= ' AND (w.lemma LIKE ? OR w.rus LIKE ?)';
        $q = '%' . str_replace(['%', '_'], ['\\%', '\\_'], trim($search)) . '%';
        $params[] = $q;
        $params[] = $q;
    }
    $sql .= ' ORDER BY w.lemma';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return catalog_map_words($userId, $stmt->fetchAll());
}

function catalog_search_words(string $term, int $userId, int $limit = 60): array
{
    $term = trim($term);
    if (mb_strlen($term) < 2) {
        return [];
    }
    $q = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $term) . '%';
    $stmt = db()->prepare(
        'SELECT * FROM words w
          WHERE (w.lemma LIKE ? OR w.rus LIKE ?)
            AND ' . catalog_word_visible_sql() . '
          ORDER BY w.lemma LIMIT ?',
    );
    $stmt->bindValue(1, $q);
    $stmt->bindValue(2, $q);
    $stmt->bindValue(3, $userId, PDO::PARAM_INT);
    $stmt->bindValue(4, $limit, PDO::PARAM_INT);
    $stmt->execute();
    return catalog_map_words($userId, $stmt->fetchAll());
}

function catalog_orphan_count(int $userId): int
{
    $stmt = db()->prepare(
        'SELECT COUNT(*) FROM words w
          WHERE w.owner_user_id = ?
            AND NOT EXISTS (SELECT 1 FROM dictionary_words dw WHERE dw.word_id = w.id)',
    );
    $stmt->execute([$userId]);
    return (int) $stmt->fetchColumn();
}

function catalog_orphan_words(int $userId): array
{
    $stmt = db()->prepare(
        'SELECT w.* FROM words w
          WHERE w.owner_user_id = ?
            AND NOT EXISTS (SELECT 1 FROM dictionary_words dw WHERE dw.word_id = w.id)
          ORDER BY w.lemma',
    );
    $stmt->execute([$userId]);
    return catalog_map_words($userId, $stmt->fetchAll());
}

function catalog_quiz_rus(array $scopeIds, int $excludeId, int $limit): array
{
    $ids = array_values(array_filter($scopeIds, static fn($id) => (int) $id !== $excludeId));
    if ($ids === []) {
        return [];
    }
    shuffle($ids);
    $ids = array_slice($ids, 0, min(800, count($ids)));
    $place = implode(',', array_fill(0, count($ids), '?'));
    $stmt = db()->prepare(
        "SELECT DISTINCT TRIM(rus) AS rus FROM words
         WHERE id IN ({$place}) AND rus IS NOT NULL AND TRIM(rus) <> ''",
    );
    $stmt->execute($ids);
    $out = [];
    foreach ($stmt as $r) {
        $t = trim((string) $r['rus']);
        if (mb_strlen($t) >= 2) {
            $out[] = $t;
        }
        if (count($out) >= $limit) {
            break;
        }
    }
    return $out;
}

function catalog_new_dictionary_id(int $userId): string
{
    return 'u' . $userId . '_' . bin2hex(random_bytes(8));
}

function catalog_count_custom_dictionaries(int $userId): int
{
    $stmt = db()->prepare('SELECT COUNT(*) FROM dictionaries WHERE owner_user_id = ?');
    $stmt->execute([$userId]);
    return (int) $stmt->fetchColumn();
}

function catalog_count_custom_words(int $userId): int
{
    $stmt = db()->prepare('SELECT COUNT(*) FROM words WHERE owner_user_id = ?');
    $stmt->execute([$userId]);
    return (int) $stmt->fetchColumn();
}

function catalog_count_memberships(int $userId): int
{
    $stmt = db()->prepare(
        'SELECT COUNT(*) FROM dictionary_words dw
         JOIN dictionaries d ON d.id = dw.dictionary_id
         WHERE d.owner_user_id = ?',
    );
    $stmt->execute([$userId]);
    return (int) $stmt->fetchColumn();
}

function catalog_limits(): array
{
    $lim = api_config()['limits'] ?? [];
    return [
        'maxCustomDictionaries' => (int) ($lim['maxCustomDictionaries'] ?? 100),
        'maxCustomWords' => (int) ($lim['maxCustomWords'] ?? 20000),
        'maxRelationsPerWord' => (int) ($lim['maxRelationsPerWord'] ?? 50),
        'maxMemberships' => (int) ($lim['maxMemberships'] ?? 50000),
    ];
}
