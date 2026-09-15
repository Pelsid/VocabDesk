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
    $storedVersion = 0;
    if ($raw) {
        $parsed = json_decode($raw, true);
        if (is_array($parsed)) {
            $storedVersion = (int) ($parsed['studyPrefsVersion'] ?? 0);
            $prefs = array_merge($prefs, $parsed);
        }
    }
    if (!is_array($prefs['customCategoryIds'] ?? null)) {
        $prefs['customCategoryIds'] = [];
    }
    $defaults = srs_default_prefs();
    if ($storedVersion < 2) {
        $prefs['gradeHardInterval'] = $defaults['gradeHardInterval'];
        $prefs['gradeEasyInterval'] = $defaults['gradeEasyInterval'];
        $prefs['easyIntervalDays'] = (int) $defaults['easyIntervalDays'];
    }
    $prefs['gradeAgainInterval'] = srs_sanitize_interval($prefs['gradeAgainInterval'] ?? null, $defaults['gradeAgainInterval']);
    $prefs['gradeHardInterval'] = srs_sanitize_interval($prefs['gradeHardInterval'] ?? null, $defaults['gradeHardInterval']);
    $prefs['gradeEasyInterval'] = srs_sanitize_interval($prefs['gradeEasyInterval'] ?? null, $defaults['gradeEasyInterval']);
    $prefs['newWordPrompt'] = srs_sanitize_prompt($prefs['newWordPrompt'] ?? 'en');
    $prefs['reviewWordPrompt'] = srs_sanitize_prompt($prefs['reviewWordPrompt'] ?? 'en');
    $prefs['showPictures'] = !array_key_exists('showPictures', $prefs) || !empty($prefs['showPictures']);
    $prefs['studyPrefsVersion'] = 2;
    return srs_apply_preset_load($prefs);
}

function settings_save_prefs(int $userId, array $prefs): array
{
    $merged = array_merge(settings_prefs($userId), $prefs);
    if (isset($merged['customCategoryIds']) && !is_array($merged['customCategoryIds'])) {
        $merged['customCategoryIds'] = [];
    }
    $merged['dailyGoalWords'] = max(5, min(99, (int) $merged['dailyGoalWords']));
    $merged['newPerSession'] = max(1, (int) ($merged['newPerSession'] ?? $merged['dailyGoalWords']));
    $merged['reviewPerSession'] = max(1, (int) $merged['reviewPerSession']);
    $merged['graduatingIntervalDays'] = max(1, (int) $merged['graduatingIntervalDays']);
    $merged['easyIntervalDays'] = max(1, (int) $merged['easyIntervalDays']);
    $merged['sessionDictScope'] = (($merged['sessionDictScope'] ?? 'selected') === 'all') ? 'all' : 'selected';
    $merged['srsPresetOverrides'] = srs_sanitize_preset_overrides($merged['srsPresetOverrides'] ?? null);
    $defaults = srs_default_prefs();
    $merged['gradeAgainInterval'] = srs_sanitize_interval($merged['gradeAgainInterval'] ?? null, $defaults['gradeAgainInterval']);
    $merged['gradeHardInterval'] = srs_sanitize_interval($merged['gradeHardInterval'] ?? null, $defaults['gradeHardInterval']);
    $merged['gradeEasyInterval'] = srs_sanitize_interval($merged['gradeEasyInterval'] ?? null, $defaults['gradeEasyInterval']);
    $merged['newWordPrompt'] = srs_sanitize_prompt($merged['newWordPrompt'] ?? 'en');
    $merged['reviewWordPrompt'] = srs_sanitize_prompt($merged['reviewWordPrompt'] ?? 'en');
    $merged['showPictures'] = !array_key_exists('showPictures', $merged) || !empty($merged['showPictures']);
    $merged['studyPrefsVersion'] = 2;
    $merged = srs_apply_preset_load($merged);
    if ($merged['srsPresetOverrides'] === []) {
        $merged['srsPresetOverrides'] = new stdClass();
    }
    $name = trim((string) ($merged['displayName'] ?? ''));
    $merged['displayName'] = function_exists('mb_substr') ? mb_substr($name, 0, 40) : substr($name, 0, 40);
    $merged['theme'] = (($merged['theme'] ?? 'dark') === 'light') ? 'light' : 'dark';
    $merged['notificationsEnabled'] = !empty($merged['notificationsEnabled']);
    settings_set($userId, 'prefs', json_encode($merged, JSON_UNESCAPED_UNICODE));
    db()->prepare('UPDATE users SET display_name = ? WHERE id = ?')->execute([$merged['displayName'], $userId]);
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
