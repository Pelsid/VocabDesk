<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/http.php';
require_once __DIR__ . '/lib/auth.php';

try {
    $body = json_input();
    $action = (string) ($_GET['action'] ?? $body['action'] ?? '');
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    if ($action === 'me') {
        require_method('GET');
        json_ok(['user' => auth_public_user(auth_current_user())]);
    }

    if ($action === 'register') {
        require_method('POST');
        json_ok([
            'user' => auth_register(
                (string) ($body['email'] ?? ''),
                (string) ($body['password'] ?? ''),
                (string) ($body['displayName'] ?? ''),
            ),
        ]);
    }

    if ($action === 'login') {
        require_method('POST');
        json_ok([
            'user' => auth_login(
                (string) ($body['email'] ?? ''),
                (string) ($body['password'] ?? ''),
            ),
        ]);
    }

    if ($action === 'logout') {
        require_method('POST');
        auth_logout(!empty($body['allDevices']));
        json_ok(['ok' => true]);
    }

    if ($action === 'changePassword') {
        require_method('PUT', 'POST');
        $uid = (int) auth_require_user()['id'];
        auth_change_password(
            $uid,
            (string) ($body['currentPassword'] ?? ''),
            (string) ($body['newPassword'] ?? ''),
        );
        json_ok(['ok' => true]);
    }

    if ($action === 'account' && $method === 'DELETE') {
        require_method('DELETE');
        $uid = (int) auth_require_user()['id'];
        auth_delete_account($uid, (string) ($body['password'] ?? ''));
        json_ok(['ok' => true]);
    }

    json_error('Неизвестное действие');
} catch (PDOException $e) {
    json_pdo_error($e);
}
