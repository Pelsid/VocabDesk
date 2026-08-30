<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/http.php';
require_once __DIR__ . '/lib/settings.php';

require_method('POST');

$uid = api_user_id();
$key = settings_groq_key($uid);
if ($key === '') {
    json_error('Ключ Groq не задан. Сохраните его в разделе «Данные».', 400);
}

$body = json_input();
$mode = (string) ($body['mode'] ?? 'chat');
$cfg = api_config()['groq'];
$model = (string) ($body['model'] ?? $cfg['model']);

if ($mode === 'hint') {
    $payload = $body['payload'] ?? null;
    if (!is_array($payload)) {
        json_error('Нет payload для подсказки');
    }
    $messages = $payload['messages'] ?? null;
    if (!is_array($messages)) {
        json_error('Нет messages');
    }
    $req = [
        'model' => $model,
        'temperature' => 0.35,
        'max_tokens' => 900,
        'response_format' => ['type' => 'json_object'],
        'messages' => $messages,
    ];
    $res = groq_request($cfg['url'], $key, $req, false);
    json_ok($res);
}

if ($mode === 'chat') {
    $messages = $body['messages'] ?? null;
    if (!is_array($messages)) {
        json_error('Нет messages');
    }
    $stream = !empty($body['stream']);
    $req = [
        'model' => $model,
        'temperature' => 0.7,
        'max_tokens' => 700,
        'stream' => $stream,
        'messages' => $messages,
    ];
    if ($stream) {
        groq_stream($cfg['url'], $key, $req);
    }
    json_ok(groq_request($cfg['url'], $key, $req, false));
}

json_error('Неизвестный mode');

function groq_request(string $url, string $key, array $req, bool $stream): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $key,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($req, JSON_UNESCAPED_UNICODE),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 90,
    ]);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($raw === false) {
        json_error('Groq: ' . $err, 502);
    }
    $decoded = json_decode((string) $raw, true);
    if ($code >= 400) {
        $msg = is_array($decoded) ? (string) ($decoded['error']['message'] ?? $raw) : (string) $raw;
        json_error('Groq API ' . $code . ': ' . mb_substr($msg, 0, 400), 502);
    }
    return is_array($decoded) ? $decoded : ['raw' => $raw];
}

function groq_stream(string $url, string $key, array $req): never
{
    header('Content-Type: text/event-stream; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Accel-Buffering: no');
    while (ob_get_level() > 0) {
        ob_end_flush();
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $key,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($req, JSON_UNESCAPED_UNICODE),
        CURLOPT_WRITEFUNCTION => static function ($ch, $data) {
            echo $data;
            flush();
            return strlen($data);
        },
        CURLOPT_TIMEOUT => 120,
    ]);
    curl_exec($ch);
    curl_close($ch);
    exit;
}
