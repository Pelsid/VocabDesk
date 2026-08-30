<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/http.php';
require_once __DIR__ . '/lib/settings.php';

$uid = api_user_id();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'GET') {
    json_ok([
        'prefs' => settings_prefs($uid),
        'hasGroqKey' => settings_has_groq_key($uid),
    ]);
}

require_method('GET', 'PUT', 'POST');
$body = json_input();
$out = [
    'prefs' => settings_prefs($uid),
    'hasGroqKey' => settings_has_groq_key($uid),
];

if (isset($body['prefs']) && is_array($body['prefs'])) {
    $out['prefs'] = settings_save_prefs($uid, $body['prefs']);
}

if (array_key_exists('groqApiKey', $body)) {
    $key = trim((string) $body['groqApiKey']);
    settings_set($uid, 'groq_api_key', $key === '' ? null : $key);
    $out['hasGroqKey'] = $key !== '';
}

json_ok($out);
