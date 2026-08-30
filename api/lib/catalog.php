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
                WHERE d.kind = 'oxford' AND d.cefr IS NOT NULL";
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

function catalog_map_word(array $r): array
{
    $id = (int) $r['id'];
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
    ];
}

function catalog_dictionaries(int $userId): array
{
    $sql = "SELECT
              d.id, d.name_ru, d.kind, d.cefr, d.is_selected, d.sort_order, d.icon_key,
              COUNT(DISTINCT dw.word_id) AS word_count,
              SUM(CASE WHEN wp.mastered = 1 OR wp.bucket = 'review' THEN 1 ELSE 0 END) AS learned_count,
              SUM(CASE WHEN ox.word_id IS NOT NULL THEN 1 ELSE 0 END) AS oxford_overlap
            FROM dictionaries d
            LEFT JOIN dictionary_words dw ON dw.dictionary_id = d.id
            LEFT JOIN word_progress wp ON wp.word_id = dw.word_id AND wp.user_id = ?
            LEFT JOIN (
              SELECT DISTINCT dw2.word_id
              FROM dictionary_words dw2
              JOIN dictionaries d2 ON d2.id = dw2.dictionary_id AND d2.kind = 'oxford'
            ) ox ON ox.word_id = dw.word_id AND d.kind <> 'oxford'
            GROUP BY d.id
            ORDER BY d.sort_order, d.name_ru";
    $stmt = db()->prepare($sql);
    $stmt->execute([$userId]);
    $out = [];
    foreach ($stmt as $r) {
        $out[] = [
            'id' => (string) $r['id'],
            'name' => (string) $r['name_ru'],
            'isCustom' => false,
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

function catalog_word_ids_by_dictionary(): array
{
    $map = [];
    foreach (db()->query('SELECT dictionary_id, word_id FROM dictionary_words') as $row) {
        $did = (string) $row['dictionary_id'];
        $map[$did] ??= [];
        $map[$did][] = (int) $row['word_id'];
    }
    return $map;
}

function catalog_scope_ids(string $scope, ?string $categoryId, array $prefs): array
{
    if ($scope === 'category') {
        if (!$categoryId) {
            return [];
        }
        $stmt = db()->prepare('SELECT word_id FROM dictionary_words WHERE dictionary_id = ?');
        $stmt->execute([$categoryId]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }
    if (($prefs['categoryScopeMode'] ?? 'reword') === 'custom') {
        $ids = $prefs['customCategoryIds'] ?? [];
        if (!is_array($ids) || $ids === []) {
            return [];
        }
        $place = implode(',', array_fill(0, count($ids), '?'));
        $stmt = db()->prepare("SELECT DISTINCT word_id FROM dictionary_words WHERE dictionary_id IN ({$place})");
        $stmt->execute(array_values($ids));
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }
    $stmt = db()->query(
        'SELECT DISTINCT dw.word_id
         FROM dictionary_words dw
         JOIN dictionaries d ON d.id = dw.dictionary_id AND d.is_selected = 1',
    );
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function catalog_words_by_ids(array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if ($ids === []) {
        return [];
    }
    $out = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $place = implode(',', array_fill(0, count($chunk), '?'));
        $stmt = db()->prepare("SELECT * FROM words WHERE id IN ({$place})");
        $stmt->execute($chunk);
        $map = [];
        foreach ($stmt as $r) {
            $w = catalog_map_word($r);
            $map[$w['id']] = $w;
        }
        foreach ($chunk as $id) {
            if (isset($map[$id])) {
                $out[] = $map[$id];
            }
        }
    }
    return $out;
}

function catalog_words_in_dictionary(string $dictionaryId, string $search): array
{
    $sql = 'SELECT w.* FROM words w
            JOIN dictionary_words dw ON dw.word_id = w.id
            WHERE dw.dictionary_id = ?';
    $params = [$dictionaryId];
    if (trim($search) !== '') {
        $sql .= ' AND (w.lemma LIKE ? OR w.rus LIKE ?)';
        $q = '%' . str_replace(['%', '_'], ['\\%', '\\_'], trim($search)) . '%';
        $params[] = $q;
        $params[] = $q;
    }
    $sql .= ' ORDER BY w.lemma';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $out = [];
    foreach ($stmt as $r) {
        $out[] = catalog_map_word($r);
    }
    return $out;
}

function catalog_search_words(string $term, int $limit = 60): array
{
    $term = trim($term);
    if (mb_strlen($term) < 2) {
        return [];
    }
    $q = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $term) . '%';
    $stmt = db()->prepare(
        'SELECT * FROM words WHERE lemma LIKE ? OR rus LIKE ? ORDER BY lemma LIMIT ?',
    );
    $stmt->bindValue(1, $q);
    $stmt->bindValue(2, $q);
    $stmt->bindValue(3, $limit, PDO::PARAM_INT);
    $stmt->execute();
    $out = [];
    foreach ($stmt as $r) {
        $out[] = catalog_map_word($r);
    }
    return $out;
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
