<?php

declare(strict_types=1);

require_once __DIR__ . '/http.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/settings.php';

function auth_cookie_name(): string
{
    return (string) (api_config()['auth']['cookieName'] ?? 'vd_session');
}

function auth_session_days(): int
{
    return max(1, (int) (api_config()['auth']['sessionDays'] ?? 90));
}

function auth_secure_cookie(): bool
{
    return (bool) (api_config()['auth']['secureCookie'] ?? true);
}

function auth_norm_email(string $email): string
{
    return mb_strtolower(trim($email));
}

function auth_public_user(?array $row): ?array
{
    if ($row === null) {
        return null;
    }
    return [
        'id' => (int) $row['id'],
        'email' => (string) $row['email'],
        'displayName' => (string) ($row['display_name'] ?? ''),
    ];
}

function auth_validate_email(string $email): string
{
    $email = auth_norm_email($email);
    if ($email === '' || mb_strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_error('Укажите корректный email', 422);
    }
    return $email;
}

function auth_validate_password(string $password, string $email = ''): string
{
    $len = strlen($password);
    if ($len < 8 || $len > 200) {
        json_error('Пароль — от 8 до 200 символов', 422);
    }
    if ($email !== '' && mb_strtolower($password) === mb_strtolower($email)) {
        json_error('Пароль не должен совпадать с email', 422);
    }
    return $password;
}

function auth_validate_display_name(string $name): string
{
    $name = trim($name);
    if (function_exists('mb_substr')) {
        return mb_substr($name, 0, 40);
    }
    return substr($name, 0, 40);
}

function auth_client_ip_bin(): ?string
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    if ($ip === '') {
        return null;
    }
    $bin = inet_pton($ip);
    return $bin === false ? null : $bin;
}

function auth_set_cookie(string $value, DateTimeImmutable $expires): void
{
    setcookie(auth_cookie_name(), $value, [
        'expires' => $expires->getTimestamp(),
        'path' => '/',
        'secure' => auth_secure_cookie(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function auth_clear_cookie(): void
{
    setcookie(auth_cookie_name(), '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => auth_secure_cookie(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function auth_read_cookie(): ?array
{
    $raw = (string) ($_COOKIE[auth_cookie_name()] ?? '');
    if ($raw === '' || !str_contains($raw, '.')) {
        return null;
    }
    [$selector, $validator] = explode('.', $raw, 2);
    if (!preg_match('/^[0-9a-f]{32}$/', $selector) || !preg_match('/^[0-9a-f]{32}$/', $validator)) {
        return null;
    }
    return ['selector' => $selector, 'validator' => $validator, 'raw' => $raw];
}

function auth_gc_sessions(): void
{
    db()->exec('DELETE FROM user_sessions WHERE expires_at < NOW()');
    $cut = app_now()->modify('-2 days')->format('Y-m-d H:i:s');
    $stmt = db()->prepare('DELETE FROM auth_attempts WHERE at < ?');
    $stmt->execute([$cut]);
}

function auth_create_session(int $userId): void
{
    $selector = bin2hex(random_bytes(16));
    $validator = bin2hex(random_bytes(16));
    $expires = app_now()->modify('+' . auth_session_days() . ' days');
    $ua = substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);
    $stmt = db()->prepare(
        'INSERT INTO user_sessions (selector, user_id, token_hash, last_seen_at, expires_at, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)',
    );
    $now = app_now()->format('Y-m-d H:i:s');
    $stmt->execute([
        $selector,
        $userId,
        hash('sha256', $validator),
        $now,
        $expires->format('Y-m-d H:i:s'),
        $ua !== '' ? $ua : null,
    ]);
    auth_set_cookie($selector . '.' . $validator, $expires);
}

function auth_seed_user(int $userId, string $displayName): void
{
    $stmt = db()->prepare(
        'INSERT INTO user_dictionary_state (user_id, dictionary_id, is_selected)
         SELECT ?, id, 1 FROM dictionaries
          WHERE owner_user_id IS NULL AND is_selected = 1',
    );
    $stmt->execute([$userId]);
    $prefs = srs_default_prefs();
    $prefs['displayName'] = $displayName;
    settings_save_prefs($userId, $prefs);
}

/**
 * Лимиты считаем по IP и по паре (email, IP). Чистый лимит «5 на email» убран
 * специально: он позволял чужому IP закрыть вход конкретному человеку.
 */
function auth_guard_login(?string $ipBin, string $email): void
{
    $since = app_now()->modify('-15 minutes')->format('Y-m-d H:i:s');
    if ($ipBin === null) {
        return;
    }
    $stmt = db()->prepare(
        "SELECT COUNT(*) FROM auth_attempts WHERE kind = 'login' AND ip = ? AND at >= ?",
    );
    $stmt->execute([$ipBin, $since]);
    if ((int) $stmt->fetchColumn() >= 10) {
        json_error('Слишком много попыток входа. Попробуйте через 15 минут.', 429);
    }
    if ($email === '') {
        return;
    }
    $stmt = db()->prepare(
        "SELECT COUNT(*) FROM auth_attempts WHERE kind = 'login' AND ip = ? AND email = ? AND at >= ?",
    );
    $stmt->execute([$ipBin, $email, $since]);
    if ((int) $stmt->fetchColumn() >= 5) {
        json_error('Слишком много попыток входа. Попробуйте через 15 минут.', 429);
    }
}

function auth_guard_register(?string $ipBin): void
{
    if ($ipBin === null) {
        return;
    }
    $since = app_now()->modify('-60 minutes')->format('Y-m-d H:i:s');
    $stmt = db()->prepare(
        "SELECT COUNT(*) FROM auth_attempts WHERE kind = 'register' AND ip = ? AND at >= ?",
    );
    $stmt->execute([$ipBin, $since]);
    if ((int) $stmt->fetchColumn() >= 5) {
        json_error('Слишком много регистраций с этого адреса. Попробуйте позже.', 429);
    }
}

function auth_record_attempt(?string $ipBin, string $email, string $kind = 'login'): void
{
    $stmt = db()->prepare('INSERT INTO auth_attempts (ip, email, kind, at) VALUES (?, ?, ?, ?)');
    $stmt->execute([
        $ipBin,
        $email !== '' ? $email : null,
        $kind === 'register' ? 'register' : 'login',
        app_now()->format('Y-m-d H:i:s'),
    ]);
}

/** После успешного входа счётчик не должен мешать владельцу аккаунта. */
function auth_clear_login_attempts(?string $ipBin, string $email): void
{
    if ($email === '') {
        return;
    }
    if ($ipBin === null) {
        db()->prepare("DELETE FROM auth_attempts WHERE kind = 'login' AND email = ?")->execute([$email]);
        return;
    }
    db()->prepare("DELETE FROM auth_attempts WHERE kind = 'login' AND email = ? AND ip = ?")
        ->execute([$email, $ipBin]);
}

/**
 * Хеш, к которому не привязан ни один аккаунт: нужен, чтобы ответ на
 * несуществующий email стоил столько же времени, сколько неверный пароль.
 */
function auth_dummy_hash(): string
{
    static $hash = null;
    return $hash ??= password_hash('vd-nonexistent-' . bin2hex(random_bytes(8)), PASSWORD_DEFAULT);
}

function auth_register(string $email, string $password, string $displayName): array
{
    $ip = auth_client_ip_bin();
    auth_guard_register($ip);
    $email = auth_validate_email($email);
    $password = auth_validate_password($password, $email);
    $displayName = auth_validate_display_name($displayName);

    $exists = db()->prepare('SELECT id FROM users WHERE email = ?');
    $exists->execute([$email]);
    if ($exists->fetchColumn()) {
        json_error('Этот email уже зарегистрирован', 422);
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    try {
        $stmt = db()->prepare(
            'INSERT INTO users (email, password_hash, display_name, status) VALUES (?, ?, ?, \'active\')',
        );
        $stmt->execute([$email, $hash, $displayName]);
    } catch (PDOException $e) {
        if ((int) $e->getCode() === 23000) {
            json_error('Этот email уже зарегистрирован', 422);
        }
        throw $e;
    }
    $userId = (int) db()->lastInsertId();
    auth_record_attempt($ip, $email, 'register');
    auth_seed_user($userId, $displayName);
    auth_create_session($userId);
    $stmt = db()->prepare('UPDATE users SET last_login_at = ? WHERE id = ?');
    $stmt->execute([app_now()->format('Y-m-d H:i:s'), $userId]);
    return auth_public_user([
        'id' => $userId,
        'email' => $email,
        'display_name' => $displayName,
    ]);
}

function auth_login(string $email, string $password): array
{
    auth_gc_sessions();
    $email = auth_norm_email($email);
    $ip = auth_client_ip_bin();
    auth_guard_login($ip, $email);

    $stmt = db()->prepare('SELECT * FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $row = $stmt->fetch();
    $hash = is_array($row) && is_string($row['password_hash'] ?? null) && $row['password_hash'] !== ''
        ? (string) $row['password_hash']
        : auth_dummy_hash();
    $passwordOk = password_verify($password, $hash);
    $ok = $passwordOk && is_array($row) && ($row['status'] ?? '') === 'active';
    if (!$ok) {
        auth_record_attempt($ip, $email);
        json_error('Неверный email или пароль', 401);
    }
    auth_clear_login_attempts($ip, $email);
    auth_create_session((int) $row['id']);
    $now = app_now()->format('Y-m-d H:i:s');
    db()->prepare('UPDATE users SET last_login_at = ? WHERE id = ?')->execute([$now, (int) $row['id']]);
    return auth_public_user($row);
}

function auth_current_user(): ?array
{
    static $cached = false;
    static $user = null;
    if ($cached) {
        return $user;
    }
    $cached = true;
    if (random_int(1, 100) === 1) {
        auth_gc_sessions();
    }
    $cookie = auth_read_cookie();
    if ($cookie === null) {
        return null;
    }
    $stmt = db()->prepare(
        'SELECT s.selector, s.token_hash, s.last_seen_at, s.expires_at, u.*
           FROM user_sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.selector = ?',
    );
    $stmt->execute([$cookie['selector']]);
    $row = $stmt->fetch();
    if (!$row || ($row['status'] ?? '') !== 'active') {
        auth_clear_cookie();
        return null;
    }
    $expires = new DateTimeImmutable((string) $row['expires_at'], app_timezone());
    if ($expires < app_now()) {
        db()->prepare('DELETE FROM user_sessions WHERE selector = ?')->execute([$cookie['selector']]);
        auth_clear_cookie();
        return null;
    }
    if (!hash_equals((string) $row['token_hash'], hash('sha256', $cookie['validator']))) {
        auth_clear_cookie();
        return null;
    }
    $lastSeen = new DateTimeImmutable((string) $row['last_seen_at'], app_timezone());
    if ($lastSeen < app_now()->modify('-1 day')) {
        $newExpires = app_now()->modify('+' . auth_session_days() . ' days');
        db()->prepare(
            'UPDATE user_sessions SET last_seen_at = ?, expires_at = ? WHERE selector = ?',
        )->execute([
            app_now()->format('Y-m-d H:i:s'),
            $newExpires->format('Y-m-d H:i:s'),
            $cookie['selector'],
        ]);
        auth_set_cookie($cookie['raw'], $newExpires);
    }
    $user = [
        'id' => (int) $row['id'],
        'email' => (string) $row['email'],
        'display_name' => (string) ($row['display_name'] ?? ''),
        'status' => (string) $row['status'],
    ];
    return $user;
}

function auth_require_user(): array
{
    $user = auth_current_user();
    if ($user === null) {
        json_error('Требуется вход', 401);
    }
    return $user;
}

function auth_logout(bool $allDevices = false): void
{
    $cookie = auth_read_cookie();
    $user = auth_current_user();
    if ($allDevices && $user) {
        db()->prepare('DELETE FROM user_sessions WHERE user_id = ?')->execute([$user['id']]);
    } elseif ($cookie) {
        db()->prepare('DELETE FROM user_sessions WHERE selector = ?')->execute([$cookie['selector']]);
    }
    auth_clear_cookie();
}

function auth_change_password(int $userId, string $current, string $next): void
{
    $stmt = db()->prepare('SELECT email, password_hash FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    if (!$row || !password_verify($current, (string) $row['password_hash'])) {
        json_error('Неверный текущий пароль', 422);
    }
    $next = auth_validate_password($next, (string) $row['email']);
    $hash = password_hash($next, PASSWORD_DEFAULT);
    db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $userId]);
    $cookie = auth_read_cookie();
    if ($cookie) {
        db()->prepare('DELETE FROM user_sessions WHERE user_id = ? AND selector <> ?')
            ->execute([$userId, $cookie['selector']]);
    } else {
        db()->prepare('DELETE FROM user_sessions WHERE user_id = ?')->execute([$userId]);
    }
}

function auth_delete_account(int $userId, string $password): void
{
    $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $hash = $stmt->fetchColumn();
    if (!is_string($hash) || !password_verify($password, $hash)) {
        json_error('Неверный пароль', 422);
    }
    db()->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
    auth_clear_cookie();
}

function auth_sync_display_name(int $userId, string $displayName): void
{
    db()->prepare('UPDATE users SET display_name = ? WHERE id = ?')->execute([$displayName, $userId]);
}
