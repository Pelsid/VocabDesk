<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/srs.php';

function settings_get_all(int $userId): array
{
    $stmt = db()->prepare('SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?');
    $stmt->execute([$userId]);
    $out = [];
    foreach ($stmt as $row) {
        $out[$row['setting_key']] = $row['setting_value'];
    }
    return $out;
}

function settings_get(int $userId, string $key): ?string
{
    $stmt = db()->prepare('SELECT setting_value FROM user_settings WHERE user_id = ? AND setting_key = ?');
    $stmt->execute([$userId, $key]);
    $v = $stmt->fetchColumn();
    return $v === false ? null : (string) $v;
}

function settings_set(int $userId, string $key, ?string $value): void
{
    if ($value === null) {
        $stmt = db()->prepare('DELETE FROM user_settings WHERE user_id = ? AND setting_key = ?');
        $stmt->execute([$userId, $key]);
        return;
    }
    $stmt = db()->prepare(
        'INSERT INTO user_settings (user_id, setting_key, setting_value) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
    );
    $stmt->execute([$userId, $key, $value]);
}

function settings_prefs(int $userId): array
{
    $raw = settings_get($userId, 'prefs');
    $prefs = srs_default_prefs();
    if ($raw) {
        $parsed = json_decode($raw, true);
        if (is_array($parsed)) {
            $prefs = array_merge($prefs, $parsed);
        }
    }
    if (!is_array($prefs['customCategoryIds'] ?? null)) {
        $prefs['customCategoryIds'] = [];
    }
    return $prefs;
}

function settings_save_prefs(int $userId, array $prefs): array
{
    $merged = array_merge(settings_prefs($userId), $prefs);
    if (isset($merged['customCategoryIds']) && !is_array($merged['customCategoryIds'])) {
        $merged['customCategoryIds'] = [];
    }
    $merged['newPerSession'] = max(1, (int) $merged['newPerSession']);
    $merged['reviewPerSession'] = max(1, (int) $merged['reviewPerSession']);
    $merged['graduatingIntervalDays'] = max(1, (int) $merged['graduatingIntervalDays']);
    $merged['easyIntervalDays'] = max(1, (int) $merged['easyIntervalDays']);
    $merged['dailyGoalWords'] = max(5, min(99, (int) $merged['dailyGoalWords']));
    settings_set($userId, 'prefs', json_encode($merged, JSON_UNESCAPED_UNICODE));
    return $merged;
}

function settings_has_groq_key(int $userId): bool
{
    $k = settings_get($userId, 'groq_api_key');
    return is_string($k) && trim($k) !== '';
}

function settings_groq_key(int $userId): string
{
    return trim((string) (settings_get($userId, 'groq_api_key') ?? ''));
}
