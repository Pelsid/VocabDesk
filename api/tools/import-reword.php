<?php

declare(strict_types=1);

/**
 * Одноразовый импорт каталога Reword (без прогресса и блобов).
 * CLI: php api/tools/import-reword.php
 * Web: https://corewords.local/api/tools/import-reword.php?run=1
 */

set_time_limit(300);

$root = dirname(__DIR__, 2);
require_once dirname(__DIR__) . '/lib/db.php';
require_once dirname(__DIR__) . '/lib/oxford_catalog.php';

require_local_or_token();

$isCli = PHP_SAPI === 'cli';
if (!$isCli && ($_GET['run'] ?? '') !== '1') {
    header('Content-Type: text/plain; charset=utf-8');
    echo "Добавьте ?run=1 чтобы запустить импорт каталога в CoreWords.\n";
    exit;
}

function out(string $msg): void
{
    echo $msg, PHP_SAPI === 'cli' ? PHP_EOL : "<br>\n";
    @flush();
}

function backup_path(string $root): string
{
    $candidates = [
        $root . '/data/reword_en.backup',
        'E:/Downloads/reword_en.backup',
        'C:/Users/MaxRe/Downloads/reword_en.backup',
    ];
    foreach ($candidates as $p) {
        if (is_file($p)) {
            return $p;
        }
    }
    throw new RuntimeException('Не найден reword_en.backup (положите в data/ или Downloads).');
}

function sqlite_query_json(string $backup, string $sql): array
{
    if (in_array('sqlite', PDO::getAvailableDrivers(), true)) {
        $pdo = new PDO('sqlite:' . $backup, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        return $pdo->query($sql)->fetchAll();
    }
    $bins = [
        'E:\\Projects\\OSPanel\\bin\\sqlite3.exe',
        'sqlite3',
    ];
    $bin = null;
    foreach ($bins as $b) {
        if ($b === 'sqlite3' || is_file($b)) {
            $bin = $b;
            break;
        }
    }
    if ($bin === null) {
        throw new RuntimeException('Нет PDO SQLite и sqlite3.exe');
    }
    $tmp = tempnam(sys_get_temp_dir(), 'vd');
    $cmd = '"' . $bin . '" -json ' . escapeshellarg($backup) . ' ' . escapeshellarg($sql);
    $json = shell_exec($cmd);
    if (!is_string($json) || trim($json) === '') {
        throw new RuntimeException('sqlite3 не вернул JSON');
    }
    $data = json_decode($json, true);
    if (!is_array($data)) {
        throw new RuntimeException('Не удалось разобрать JSON sqlite3');
    }
    return $data;
}

function classify_dictionary(string $id): array
{
    $oxford = [
        'oxford3000_a1' => 'A1',
        'oxford3000_a2' => 'A2',
        'oxford3000_b1' => 'B1',
        'oxford3000_b2' => 'B2',
        'oxford5000_c1' => 'C1',
    ];
    $id = oxford_canonical_id($id);
    if (isset($oxford[$id]) || str_starts_with($id, 'oxford')) {
        $cefr = $oxford[$id] ?? (preg_match('/_([abc][12])$/i', $id, $m) ? strtoupper($m[1]) : null);
        $order = ['A1' => 10, 'A2' => 20, 'B1' => 30, 'B2' => 40, 'C1' => 50, 'C2' => 60][$cefr ?? ''] ?? 80;
        return ['oxford', $cefr, $order];
    }
    return ['thematic', null, 200];
}

function apply_schema(PDO $pdo, string $root): void
{
    $sql = file_get_contents($root . '/sql/schema.sql');
    if ($sql === false) {
        throw new RuntimeException('Нет sql/schema.sql');
    }
    $parts = array_filter(array_map('trim', preg_split('/;\s*\n/', $sql) ?: []));
    foreach ($parts as $stmt) {
        if ($stmt === '' || str_starts_with($stmt, '--')) {
            continue;
        }
        $pdo->exec($stmt);
    }
}

try {
    $backup = backup_path($root);
    out('Бэкап: ' . $backup);

    $pdo = db();
    apply_schema($pdo, $root);
    out('Схема применена.');

    $cats = sqlite_query_json($backup, "
        SELECT ID, NAME_RUS, IS_CUSTOM, IS_SELECTED, CUSTOM_ICON
        FROM CATEGORY
        WHERE IS_CUSTOM = 0
          AND NAME_RUS IS NOT NULL AND TRIM(NAME_RUS) <> ''
    ");
    out('Словарей в каталоге: ' . count($cats));

    $pdo->beginTransaction();
    $insDict = $pdo->prepare(
        'INSERT INTO dictionaries (id, name_ru, kind, cefr, is_selected, sort_order, icon_key)
         VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    $dictIds = [];
    $selectedById = [];
    foreach ($cats as $c) {
        $rawId = (string) $c['ID'];
        $id = oxford_canonical_id($rawId);
        [$kind, $cefr, $baseOrder] = classify_dictionary($rawId);
        $icon = isset($c['CUSTOM_ICON']) && trim((string) $c['CUSTOM_ICON']) !== '' ? (string) $c['CUSTOM_ICON'] : null;
        $selected = (int) $c['IS_SELECTED'] === 1 ? 1 : 0;
        $selectedById[$id] = (int) (($selectedById[$id] ?? 0) || $selected);
        if (isset($dictIds[$id])) {
            continue;
        }
        $insDict->execute([
            $id,
            oxford_display_name($rawId, (string) $c['NAME_RUS']),
            $kind,
            $cefr,
            $selected,
            $baseOrder,
            $icon,
        ]);
        $dictIds[$id] = true;
    }
    foreach ($selectedById as $id => $selected) {
        if ($selected) {
            $pdo->prepare('UPDATE dictionaries SET is_selected = 1 WHERE id = ?')->execute([$id]);
        }
    }
    $dictIds = array_keys($dictIds);
    $pdo->commit();
    out('Словари записаны.');

    if ($dictIds === []) {
        throw new RuntimeException('Пустой каталог словарей');
    }

    $fetchIds = array_values(array_unique([...$dictIds, ...array_keys(oxford_merge_ids())]));
    $place = implode(',', array_map(static fn($id) => "'" . str_replace("'", "''", $id) . "'", $fetchIds));
    $links = sqlite_query_json($backup, "
        SELECT WORD_ID, CATEGORY_ID FROM WORD_CATEGORY WHERE CATEGORY_ID IN ({$place})
    ");
    out('Связей слово↔словарь: ' . count($links));

    $wordIds = [];
    foreach ($links as $l) {
        $wordIds[(int) $l['WORD_ID']] = true;
    }
    $wordIdList = array_keys($wordIds);
    out('Уникальных слов: ' . count($wordIdList));

    $words = [];
    foreach (array_chunk($wordIdList, 800) as $chunk) {
        $in = implode(',', $chunk);
        $rows = sqlite_query_json($backup, "
            SELECT
              w.ID AS id,
              w.WORD AS lemma,
              w.RUS AS rus,
              w.TRANSCRIPTION AS transcription,
              w.POS AS pos,
              w.EXAMPLES_RUS AS examples_rus,
              p.SOURCE AS picture_source,
              p.SOURCE_ID AS picture_source_id
            FROM WORD w
            LEFT JOIN PICTURE p ON p.ID = w.PICTURE_ID
            WHERE w.ID IN ({$in})
        ");
        foreach ($rows as $r) {
            $words[] = $r;
        }
    }
    out('Строк WORD прочитано: ' . count($words));

    $pdo->beginTransaction();
    $insWord = $pdo->prepare(
        'INSERT INTO words (id, lemma, rus, transcription, pos, examples_rus, picture_source, picture_source_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $n = 0;
    foreach ($words as $w) {
        $examples = $w['examples_rus'] ?? $w['EXAMPLES_RUS'] ?? null;
        if (is_string($examples) && trim($examples) !== '') {
            json_decode($examples);
            if (json_last_error() !== JSON_ERROR_NONE) {
                $examples = null;
            }
        } else {
            $examples = null;
        }
        $pos = $w['pos'] ?? $w['POS'] ?? null;
        $insWord->execute([
            (int) ($w['id'] ?? $w['ID']),
            (string) ($w['lemma'] ?? $w['WORD'] ?? ''),
            $w['rus'] ?? $w['RUS'] ?? null,
            $w['transcription'] ?? $w['TRANSCRIPTION'] ?? null,
            $pos === null || $pos === '' ? null : (int) $pos,
            $examples,
            $w['picture_source'] ?? $w['SOURCE'] ?? null,
            $w['picture_source_id'] ?? $w['SOURCE_ID'] ?? null,
        ]);
        $n++;
        if ($n % 2000 === 0) {
            out("  слова: {$n}");
        }
    }
    $pdo->commit();
    out("Слова записаны: {$n}");

    $pdo->beginTransaction();
    $insLink = $pdo->prepare('INSERT IGNORE INTO dictionary_words (dictionary_id, word_id) VALUES (?, ?)');
    $ln = 0;
    foreach ($links as $l) {
        $insLink->execute([oxford_canonical_id((string) $l['CATEGORY_ID']), (int) $l['WORD_ID']]);
        $ln++;
    }
    $pdo->commit();
    out("Связи записаны: {$ln}");

    $pdo->prepare('INSERT IGNORE INTO users (id) VALUES (1)')->execute();

    $check = $pdo->query(
        "SELECT COUNT(*) FROM dictionary_words dw
         JOIN dictionary_words ox ON ox.word_id = dw.word_id
         JOIN dictionaries d ON d.id = ox.dictionary_id AND d.kind = 'oxford'
         WHERE dw.dictionary_id = 'business'",
    )->fetchColumn();
    out('Пересечение business ∩ Oxford: ' . (int) $check . ' слов');
    out('Готово.');
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    out('Ошибка: ' . $e->getMessage());
    exit(1);
}
