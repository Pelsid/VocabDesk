<?php

declare(strict_types=1);

/**
 * Применяет sql/migrations/002_auth_and_custom_dicts.sql
 * CLI: php api/tools/apply-migration-002.php
 * Web: /api/tools/apply-migration-002.php?run=1
 */

require_once dirname(__DIR__) . '/lib/db.php';

require_local_or_token();

$isCli = PHP_SAPI === 'cli';
if (!$isCli && ($_GET['run'] ?? '') !== '1') {
    header('Content-Type: text/plain; charset=utf-8');
    echo "Добавьте ?run=1 чтобы применить миграцию 002.\n";
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

$path = dirname(__DIR__, 2) . '/sql/migrations/002_auth_and_custom_dicts.sql';
if (!is_file($path)) {
    http_response_code(500);
    migrate_out('Файл миграции не найден: ' . $path);
    exit(1);
}

$pdo = db();
$check = $pdo->query(
    "SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'email'",
);
$hadEmail = (int) $check->fetchColumn() > 0;

$stmts = migrate_split_sql((string) file_get_contents($path));
$ok = 0;
foreach ($stmts as $i => $stmt) {
    try {
        // Через query() + closeCursor(), потому что EXECUTE может вернуть набор строк:
        // непрочитанный результат ломает следующий запрос (ошибка 2014).
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

migrate_out($hadEmail
    ? "Миграция 002 уже была частично или полностью применена. Повтор: {$ok} выражений ок."
    : "Миграция 002 применена: {$ok} выражений.");
exit(0);
