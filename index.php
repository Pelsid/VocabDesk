<?php

declare(strict_types=1);

/** Nginx отдаёт этот файл вместо исходного Vite index.html. */
$built = __DIR__ . '/dist/index.html';
if (!is_file($built)) {
    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><p>Сборка не найдена. В корне проекта выполните <code>npm run build</code>.</p>';
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
readfile($built);
