<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/http.php';
require_once __DIR__ . '/lib/catalog.php';

require_method('GET', 'POST', 'PUT', 'DELETE');

const WORD_RELATIONS = ['related', 'synonym', 'antonym', 'form', 'collocation'];

$uid = api_user_id();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$body = $method === 'GET' ? [] : json_input();
$action = (string) ($_GET['action'] ?? $body['action'] ?? '');

function user_words_encode_examples(mixed $raw): ?string
{
    if ($raw === null || $raw === '') {
        return null;
    }
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            json_error('Примеры должны быть JSON-массивом {o, t}', 422);
        }
        $raw = $decoded;
    }
    if (!is_array($raw)) {
        json_error('Примеры должны быть массивом {o, t}', 422);
    }
    $out = [];
    foreach ($raw as $row) {
        if (!is_array($row)) {
            continue;
        }
        $o = trim((string) ($row['o'] ?? $row['original'] ?? ''));
        $t = trim((string) ($row['t'] ?? $row['translate'] ?? ''));
        if ($o === '' && $t === '') {
            continue;
        }
        $out[] = ['o' => $o, 't' => $t];
    }
    return $out === [] ? null : json_encode($out, JSON_UNESCAPED_UNICODE);
}

function user_words_require_own(int $userId, int $wordId): array
{
    $row = catalog_require_word($userId, $wordId);
    if ((int) ($row['owner_user_id'] ?? 0) !== $userId) {
        json_error('Слово общего каталога нельзя изменить', 403);
    }
    return $row;
}

function user_words_suggest_global(string $lemma): array
{
    $stmt = db()->prepare(
        'SELECT * FROM words WHERE owner_user_id IS NULL AND lemma = ? ORDER BY id LIMIT 8',
    );
    $stmt->execute([$lemma]);
    return $stmt->fetchAll();
}

function user_words_count_relations(int $userId, int $wordId): int
{
    $stmt = db()->prepare(
        'SELECT COUNT(*) FROM word_relations
          WHERE user_id = ? AND (word_id = ? OR related_word_id = ?)',
    );
    $stmt->execute([$userId, $wordId, $wordId]);
    return (int) $stmt->fetchColumn();
}

function user_words_relations_payload(int $userId, int $wordId): array
{
    catalog_require_word($userId, $wordId);
    $stmt = db()->prepare(
        'SELECT * FROM word_relations
          WHERE user_id = ? AND (word_id = ? OR related_word_id = ?)
          ORDER BY created_at',
    );
    $stmt->execute([$userId, $wordId, $wordId]);
    $rows = $stmt->fetchAll();
    $otherIds = [];
    foreach ($rows as $r) {
        $a = (int) $r['word_id'];
        $b = (int) $r['related_word_id'];
        $otherIds[] = $a === $wordId ? $b : $a;
    }
    $cards = [];
    foreach (catalog_words_by_ids($otherIds, $userId) as $w) {
        $cards[$w['id']] = $w;
    }
    $out = [];
    foreach ($rows as $r) {
        $a = (int) $r['word_id'];
        $b = (int) $r['related_word_id'];
        $otherId = $a === $wordId ? $b : $a;
        if (!isset($cards[$otherId])) {
            continue;
        }
        $out[] = [
            'wordId' => $a,
            'relatedWordId' => $b,
            'relation' => (string) $r['relation'],
            'note' => $r['note'] !== null && $r['note'] !== '' ? (string) $r['note'] : null,
            'other' => $cards[$otherId],
        ];
    }
    return $out;
}

if ($action === 'orphans' && $method === 'GET') {
    json_ok(['words' => catalog_orphan_words($uid)]);
}

if ($action === 'relations' && $method === 'GET') {
    $wordId = (int) ($_GET['wordId'] ?? 0);
    json_ok(['relations' => user_words_relations_payload($uid, $wordId)]);
}

if ($action === 'create') {
    $dictId = (string) ($body['dictionaryId'] ?? '');
    catalog_require_own_dictionary($uid, $dictId);
    $lemma = trim((string) ($body['lemma'] ?? ''));
    if ($lemma === '' || mb_strlen($lemma) > 255) {
        json_error('Укажите слово (лемму)', 422);
    }
    $rus = trim((string) ($body['rus'] ?? ''));
    $rus = $rus !== '' ? $rus : null;
    $tr = trim((string) ($body['transcription'] ?? ''));
    $tr = $tr !== '' ? mb_substr($tr, 0, 512) : null;
    $examples = user_words_encode_examples($body['examples'] ?? null);
    $lim = catalog_limits();

    $exist = db()->prepare('SELECT * FROM words WHERE owner_user_id = ? AND lemma = ?');
    $exist->execute([$uid, $lemma]);
    $row = $exist->fetch();
    $reused = false;
    if ($row) {
        $reused = true;
        $wordId = (int) $row['id'];
    } else {
        if (catalog_count_custom_words($uid) >= $lim['maxCustomWords']) {
            json_error('Не больше ' . $lim['maxCustomWords'] . ' личных слов', 422);
        }
        $ins = db()->prepare(
            'INSERT INTO words (owner_user_id, lemma, rus, transcription, examples_rus)
             VALUES (?, ?, ?, ?, ?)',
        );
        $ins->execute([$uid, $lemma, $rus, $tr, $examples]);
        $wordId = (int) db()->lastInsertId();
        $row = catalog_require_word($uid, $wordId);
    }
    if (catalog_count_memberships($uid) >= $lim['maxMemberships']) {
        json_error('Не больше ' . $lim['maxMemberships'] . ' слов в личных словарях', 422);
    }
    db()->prepare('INSERT IGNORE INTO dictionary_words (dictionary_id, word_id) VALUES (?, ?)')
        ->execute([$dictId, $wordId]);
    $suggest = $reused ? [] : user_words_suggest_global($lemma);
    json_ok([
        'word' => catalog_map_words($uid, [$row])[0],
        'reused' => $reused,
        'suggestGlobal' => catalog_map_words($uid, $suggest),
        'dictionary' => catalog_dictionary_card($uid, $dictId),
    ]);
}

if ($action === 'update') {
    $wordId = (int) ($body['wordId'] ?? 0);
    $row = user_words_require_own($uid, $wordId);
    $lemma = array_key_exists('lemma', $body) ? trim((string) $body['lemma']) : (string) $row['lemma'];
    if ($lemma === '' || mb_strlen($lemma) > 255) {
        json_error('Укажите слово (лемму)', 422);
    }
    $rus = array_key_exists('rus', $body) ? trim((string) $body['rus']) : (string) ($row['rus'] ?? '');
    $rus = $rus !== '' ? $rus : null;
    $tr = array_key_exists('transcription', $body)
        ? trim((string) $body['transcription'])
        : (string) ($row['transcription'] ?? '');
    $tr = $tr !== '' ? mb_substr($tr, 0, 512) : null;
    $examples = array_key_exists('examples', $body)
        ? user_words_encode_examples($body['examples'])
        : ($row['examples_rus'] !== null
            ? (is_string($row['examples_rus']) ? $row['examples_rus'] : json_encode($row['examples_rus'], JSON_UNESCAPED_UNICODE))
            : null);
    try {
        db()->prepare(
            'UPDATE words SET lemma = ?, rus = ?, transcription = ?, examples_rus = ?
              WHERE id = ? AND owner_user_id = ?',
        )->execute([$lemma, $rus, $tr, $examples, $wordId, $uid]);
    } catch (PDOException $e) {
        if ((int) $e->getCode() === 23000) {
            json_error('У вас уже есть слово с такой леммой', 422);
        }
        throw $e;
    }
    $fresh = catalog_require_word($uid, $wordId);
    json_ok(['word' => catalog_map_words($uid, [$fresh])[0]]);
}

if ($action === 'delete' && $method === 'DELETE') {
    $wordId = (int) ($body['wordId'] ?? $_GET['wordId'] ?? 0);
    user_words_require_own($uid, $wordId);
    db()->prepare('DELETE FROM words WHERE id = ? AND owner_user_id = ?')->execute([$wordId, $uid]);
    json_ok(['ok' => true]);
}

if ($action === 'purgeOrphans') {
    db()->prepare(
        'DELETE w FROM words w
          WHERE w.owner_user_id = ?
            AND NOT EXISTS (SELECT 1 FROM dictionary_words dw WHERE dw.word_id = w.id)',
    )->execute([$uid]);
    json_ok(['ok' => true]);
}

if ($action === 'link') {
    $wordId = (int) ($body['wordId'] ?? 0);
    $related = (int) ($body['relatedWordId'] ?? 0);
    $relation = (string) ($body['relation'] ?? 'related');
    $note = trim((string) ($body['note'] ?? ''));
    $note = $note !== '' ? mb_substr($note, 0, 255) : null;
    if ($wordId <= 0 || $related <= 0 || $wordId === $related) {
        json_error('Нельзя связать слово с самим собой', 422);
    }
    if (!in_array($relation, WORD_RELATIONS, true)) {
        json_error('Неизвестный тип связи', 422);
    }
    catalog_require_word($uid, $wordId);
    catalog_require_word($uid, $related);
    $lim = catalog_limits();
    if (user_words_count_relations($uid, $wordId) >= $lim['maxRelationsPerWord']) {
        json_error('Не больше ' . $lim['maxRelationsPerWord'] . ' связей на слово', 422);
    }
    try {
        db()->prepare(
            'INSERT INTO word_relations (user_id, word_id, related_word_id, relation, note)
             VALUES (?, ?, ?, ?, ?)',
        )->execute([$uid, $wordId, $related, $relation, $note]);
    } catch (PDOException $e) {
        if ((int) $e->getCode() === 23000) {
            json_error('Такая связь уже есть', 422);
        }
        throw $e;
    }
    json_ok(['relations' => user_words_relations_payload($uid, $wordId)]);
}

if ($action === 'unlink') {
    $wordId = (int) ($body['wordId'] ?? 0);
    $related = (int) ($body['relatedWordId'] ?? 0);
    $relation = (string) ($body['relation'] ?? 'related');
    db()->prepare(
        'DELETE FROM word_relations
          WHERE user_id = ? AND relation = ?
            AND ((word_id = ? AND related_word_id = ?) OR (word_id = ? AND related_word_id = ?))',
    )->execute([$uid, $relation, $wordId, $related, $related, $wordId]);
    json_ok(['relations' => user_words_relations_payload($uid, $wordId)]);
}

json_error('Неизвестное действие');
