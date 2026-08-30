<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/http.php';
require_once __DIR__ . '/lib/catalog.php';

require_method('GET');
json_ok(['dictionaries' => catalog_dictionaries(api_user_id())]);
