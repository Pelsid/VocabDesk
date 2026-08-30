<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/http.php';
require_once __DIR__ . '/lib/progress_svc.php';

$uid = api_user_id();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'GET') {
    json_ok([
        'progress' => progress_snapshot($uid),
        'daily' => daily_payload($uid),
    ]);
}

require_method('GET', 'PUT', 'POST');
$body = json_input();
$action = (string) ($body['action'] ?? '');

if ($action === 'grade') {
    json_ok(progress_grade($uid, (int) ($body['wordId'] ?? 0), (string) ($body['grade'] ?? '')));
}
if ($action === 'master') {
    json_ok(progress_master($uid, (int) ($body['wordId'] ?? 0)));
}
if ($action === 'reset') {
    progress_reset($uid);
    json_ok([
        'progress' => progress_snapshot($uid),
        'daily' => daily_payload($uid),
    ]);
}

json_error('Неизвестное действие');
