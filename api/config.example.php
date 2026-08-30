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
    'user_id' => 1,
    'groq' => [
        'url' => 'https://api.groq.com/openai/v1/chat/completions',
        'model' => 'openai/gpt-oss-120b',
    ],
];
