<?php

declare(strict_types=1);

function api_config(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $local = dirname(__DIR__) . '/config.local.php';
    $example = dirname(__DIR__) . '/config.example.php';
    $path = is_file($local) ? $local : $example;
    $cfg = require $path;
    return $cfg;
}

function api_user_id(): int
{
    return (int) (api_config()['user_id'] ?? 1);
}

function json_input(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function json_ok(mixed $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_error(string $message, int $code = 400): never
{
    json_ok(['error' => $message], $code);
}

function require_method(string ...$methods): void
{
    $m = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($m === 'OPTIONS') {
        header('Allow: ' . implode(', ', $methods));
        http_response_code(204);
        exit;
    }
    if (!in_array($m, $methods, true)) {
        json_error('Метод не поддерживается', 405);
    }
}
