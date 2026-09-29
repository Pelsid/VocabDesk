<?php

declare(strict_types=1);

return [
    'db' => [
        'host' => 'MariaDB-11.4',
        'port' => 3306,
        'name' => 'CoreWords',
        'user' => 'root',
        'pass' => '',
        'charset' => 'utf8mb4',
    ],
    // Только для CLI-импорта (php api/tools/import-thematic.php). В HTTP игнорируется.
    'user_id' => 1,
    // День daily_stats и скользящее продление сессии считаются в этой зоне.
    'timezone' => 'Asia/Almaty',
    'auth' => [
        'cookieName' => 'vd_session',
        'sessionDays' => 90,
        'secureCookie' => true,   // false для локального http
        // Vite-прокси: Origin = localhost:5173, Host = corewords.local.
        // На проде список нужно оставить пустым: свой Origin разрешается всегда.
        'allowedOrigins' => [
            'http://localhost:5173',
            'https://localhost:5173',
        ],
    ],
    // Скрипты api/tools/ по HTTP работают только с localhost. Токен нужен,
    // если запускать их с чужого адреса (?token=...). Пусто — запуск запрещён.
    'toolsToken' => '',
    'limits' => [
        'maxCustomDictionaries' => 100,
        'maxCustomWords' => 20000,
        'maxRelationsPerWord' => 50,
        'maxMemberships' => 50000,
    ],
    'groq' => [
        'url' => 'https://api.groq.com/openai/v1/chat/completions',
        'model' => 'openai/gpt-oss-120b',
    ],
];
