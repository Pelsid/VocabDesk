<?php

declare(strict_types=1);

/**
 * Применяет sql/migrations/003_oxford_rename_and_merge_b2.sql
 * и подменяет oxford5000_b2 → oxford3000_b2 в prefs.customCategoryIds.
 * CLI: php api/tools/apply-migration-003.php
 * Web: /api/tools/apply-migration-003.php?run=1
 */

require_once dirname(__DIR__) . '/lib/db.php';

require_local_or_token();

$isCli = PHP_SAPI === 'cli';
if (!$isCli && ($_GET['run'] ?? '') !== '1') {
    header('Content-Type: text/plain; charset=utf-8');
    echo "Добавьте ?run=1 чтобы применить миграцию 003.\n";
    exit;
}

if (!$isCli) {
    header('Content-Type: text/plain; charset=utf-8');
}

function migrate_out(string $msg): void
{
    echo $msg, PHP_SAPI === 'cli' ? PHP_EOL : "\n";
    @flush();
}

function migrate_split_sql(string $sql): array
{
    $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;
    $parts = preg_split('/;\s*\n/', $sql) ?: [];
    $out = [];
    foreach ($parts as $part) {
        $part = trim($part);
        if ($part === '') {
            continue;
        }
        $out[] = rtrim($part, ';');
    }
    return $out;
}

$path = dirname(__DIR__, 2) . '/sql/migrations/003_oxford_rename_and_merge_b2.sql';
if (!is_file($path)) {
    http_response_code(500);
    migrate_out('Файл миграции не найден: ' . $path);
    exit(1);
}

$pdo = db();
$hadSource = (int) $pdo->query("SELECT COUNT(*) FROM dictionaries WHERE id = 'oxford5000_b2'")->fetchColumn() > 0;

$stmts = migrate_split_sql((string) file_get_contents($path));
$ok = 0;
foreach ($stmts as $i => $stmt) {
    try {
        $res = $pdo->query($stmt);
        if ($res !== false) {
            $res->closeCursor();
        }
        $ok++;
    } catch (PDOException $e) {
        migrate_out('Ошибка в выражении #' . ($i + 1) . ': ' . $e->getMessage());
        migrate_out(mb_substr($stmt, 0, 240));
        exit(1);
    }
}

$prefsFixed = 0;
$sel = $pdo->query("SELECT user_id, setting_value FROM user_settings WHERE setting_key = 'prefs'");
$upd = $pdo->prepare(
    'UPDATE user_settings SET setting_value = ? WHERE user_id = ? AND setting_key = \'prefs\'',
);
foreach ($sel as $row) {
    $parsed = json_decode((string) $row['setting_value'], true);
    if (!is_array($parsed) || !is_array($parsed['customCategoryIds'] ?? null)) {
        continue;
    }
    $ids = [];
    $changed = false;
    foreach ($parsed['customCategoryIds'] as $id) {
        $id = (string) $id;
        if ($id === 'oxford5000_b2') {
            $id = 'oxford3000_b2';
            $changed = true;
        }
        $ids[$id] = true;
    }
    if (!$changed) {
        continue;
    }
    $parsed['customCategoryIds'] = array_keys($ids);
    $upd->execute([json_encode($parsed, JSON_UNESCAPED_UNICODE), (int) $row['user_id']]);
    $prefsFixed++;
}

$b2Count = (int) $pdo->query("SELECT COUNT(*) FROM dictionary_words WHERE dictionary_id = 'oxford3000_b2'")->fetchColumn();
$gone = (int) $pdo->query("SELECT COUNT(*) FROM dictionaries WHERE id = 'oxford5000_b2'")->fetchColumn() === 0;

migrate_out($hadSource
    ? "Миграция 003: слиты B2, переименованы Oxford. SQL: {$ok} ок, prefs: {$prefsFixed}, слов в Oxford 4000 - B2: {$b2Count}."
    : "Миграция 003 повтор: SQL {$ok} ок, prefs {$prefsFixed}. oxford5000_b2 " . ($gone ? 'уже нет' : 'ещё на месте') . ", слов B2: {$b2Count}.");
exit(0);
