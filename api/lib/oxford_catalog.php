<?php

declare(strict_types=1);

/** Отображаемые имена встроенных Oxford-словарей (id в бэкапе Reword не меняем). */
function oxford_display_names(): array
{
    return [
        'oxford3000_a1' => 'Oxford 1000 - A1',
        'oxford3000_a2' => 'Oxford 2000 - A2',
        'oxford3000_b2' => 'Oxford 4000 - B2',
        'oxford5000_c1' => 'Oxford 6000 - C1',
    ];
}

/** Источник → целевой id: словари, которые сливаем в один. */
function oxford_merge_ids(): array
{
    return [
        'oxford5000_b2' => 'oxford3000_b2',
    ];
}

function oxford_canonical_id(string $id): string
{
    return oxford_merge_ids()[$id] ?? $id;
}

function oxford_display_name(string $id, string $fallback): string
{
    $names = oxford_display_names();
    $canon = oxford_canonical_id($id);
    return $names[$canon] ?? $names[$id] ?? $fallback;
}
