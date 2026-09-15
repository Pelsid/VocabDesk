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

function app_timezone(): DateTimeZone
{
    $tz = (string) (api_config()['timezone'] ?? 'UTC');
    try {
        return new DateTimeZone($tz);
    } catch (Exception) {
        return new DateTimeZone('UTC');
    }
}

function app_now(): DateTimeImmutable
{
    return new DateTimeImmutable('now', app_timezone());
}

function api_user_id(): int
{
    if (PHP_SAPI === 'cli') {
        return (int) (api_config()['user_id'] ?? 1);
    }
    require_once __DIR__ . '/auth.php';
    return (int) auth_require_user()['id'];
}

function require_same_origin(): void
{
    $marker = (string) ($_SERVER['HTTP_X_VD_REQUEST'] ?? '');
    if ($marker !== '1') {
        json_error('Запрос отклонён', 403);
    }
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin === '') {
        return;
    }
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
    $originHost = parse_url($origin, PHP_URL_HOST);
    $originPort = parse_url($origin, PHP_URL_PORT);
    $originFull = is_string($originHost) ? $originHost : '';
    if (is_int($originPort)) {
        $originFull .= ':' . $originPort;
    }
    $allowed = api_config()['auth']['allowedOrigins'] ?? [];
    $ok = $originFull !== '' && strcasecmp($originFull, $host) === 0;
    if (!$ok && is_array($allowed)) {
        foreach ($allowed as $item) {
            if (is_string($item) && strcasecmp(rtrim($item, '/'), rtrim($origin, '/')) === 0) {
                $ok = true;
                break;
            }
        }
    }
    if (!$ok) {
        json_error('Запрос отклонён', 403);
    }
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

function json_headers(): void
{
    if (headers_sent()) {
        return;
    }
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
}

function json_ok(mixed $data, int $code = 200): never
{
    if (!headers_sent()) {
        http_response_code($code);
    }
    json_headers();
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_error(string $message, int $code = 400): never
{
    json_ok(['error' => $message], $code);
}

function json_pdo_error(PDOException $e): never
{
    $state = (string) $e->getCode();
    $msg = $e->getMessage();
    if ($state === '42S22' || str_contains($msg, 'Unknown column') || str_contains($msg, 'Base table or view not found')) {
        json_error('База не обновлена. Примените sql/migrations/002_auth_and_custom_dicts.sql', 500);
    }
    json_error('Ошибка базы данных', 500);
}

/**
 * Скрипты из api/tools/ меняют схему и заливают каталог. По HTTP их пускаем
 * только с самой машины или по токену из конфига: на прод каталог tools/ вообще
 * не заливается, но если он туда попал — снаружи он закрыт.
 */
function require_local_or_token(): void
{
    if (PHP_SAPI === 'cli') {
        return;
    }
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    if ($ip === '127.0.0.1' || $ip === '::1') {
        return;
    }
    $expected = (string) (api_config()['toolsToken'] ?? '');
    $given = (string) ($_GET['token'] ?? '');
    if ($expected !== '' && $given !== '' && hash_equals($expected, $given)) {
        return;
    }
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Доступ запрещён: запускайте из CLI или с локальной машины.\n";
    exit;
}

function require_method(string ...$methods): void
{
    header('X-Content-Type-Options: nosniff');
    $m = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($m === 'OPTIONS') {
        header('Allow: ' . implode(', ', $methods));
        http_response_code(204);
        exit;
    }
    if (!in_array($m, $methods, true)) {
        json_error('Метод не поддерживается', 405);
    }
    if (in_array($m, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        require_same_origin();
    }
}

/**
 * Ни один необработанный Throwable не должен дойти до браузера: иначе в ответ
 * уезжает стек с путями файлов. В лог — подробности, в ответ — только текст.
 */
function api_install_error_handlers(): void
{
    static $done = false;
    if ($done || PHP_SAPI === 'cli') {
        return;
    }
    $done = true;
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');

    set_exception_handler(static function (Throwable $e): void {
        error_log('CoreWords: ' . $e);
        if ($e instanceof PDOException) {
            json_pdo_error($e);
        }
        json_error('Внутренняя ошибка сервера', 500);
    });

    register_shutdown_function(static function (): void {
        $err = error_get_last();
        if ($err === null || !in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
            return;
        }
        error_log('CoreWords fatal: ' . $err['message'] . ' @ ' . $err['file'] . ':' . $err['line']);
        if (!headers_sent()) {
            json_error('Внутренняя ошибка сервера', 500);
        }
    });
}

api_install_error_handlers();
