<?php

declare(strict_types=1);

require_once __DIR__ . '/http.php';

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $c = api_config()['db'];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $c['host'],
        (int) $c['port'],
        $c['name'],
        $c['charset'] ?? 'utf8mb4',
    );
    try {
        $pdo = new PDO($dsn, $c['user'], $c['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $e) {
        json_error('Не удалось подключиться к CoreWords: ' . $e->getMessage(), 500);
    }
    return $pdo;
}
