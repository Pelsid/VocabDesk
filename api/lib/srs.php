<?php

declare(strict_types=1);

const SRS_MINUTE = 60_000;
const SRS_DAY = 86_400_000;
const SRS_LEARNING_STEPS = [1 * SRS_MINUTE, 10 * SRS_MINUTE, 1 * SRS_DAY];

function srs_default_prefs(): array
{
    return [
        'newPerSession' => 20,
        'reviewPerSession' => 200,
        'graduatingIntervalDays' => 1,
        'easyIntervalDays' => 4,
        'dailyGoalWords' => 15,
        'categoryScopeMode' => 'reword',
        'customCategoryIds' => [],
        'srsPresetId' => null,
        'displayName' => '',
        'theme' => 'dark',
        'notificationsEnabled' => false,
    ];
}

function srs_default_new(int $now): array
{
    return [
        'bucket' => 'new',
        'due' => $now,
        'ease' => 2.5,
        'intervalDays' => 0,
        'step' => 0,
        'reps' => 0,
        'lapses' => 0,
    ];
}

function srs_clamp_ease(float $ease): float
{
    return min(3.0, max(1.3, round($ease * 1000) / 1000));
}

function srs_adjust_ease(float $ease, string $grade): float
{
    $q = $grade === 'again' ? 1 : ($grade === 'hard' ? 3 : ($grade === 'good' ? 4 : 5));
    $delta = 0.1 - (5 - $q) * (0.08 + (5 - $q) * 0.02);
    return srs_clamp_ease($ease + $delta);
}

function srs_graduate(int $now, float $ease, int $intervalDays, int $reps): array
{
    return [
        'bucket' => 'review',
        'due' => $now + $intervalDays * SRS_DAY,
        'ease' => $ease,
        'intervalDays' => $intervalDays,
        'step' => count(SRS_LEARNING_STEPS),
        'reps' => max(1, $reps + 1),
        'lapses' => 0,
        'lastReviewMs' => $now,
    ];
}

function srs_apply(?array $prev, string $grade, int $now, array $prefs): array
{
    $base = $prev ?? srs_default_new($now);
    $bucket = $base['bucket'] ?? 'new';
    if ($bucket === 'new' || $bucket === 'learning') {
        return srs_grade_young($base, $grade, $now, $prefs);
    }
    if ($bucket === 'relearn') {
        return srs_grade_relearn($base, $grade, $now, $prefs);
    }
    return srs_grade_mature($base, $grade, $now, $prefs);
}

function srs_grade_young(array $s, string $grade, int $now, array $prefs): array
{
    $ease = (float) $s['ease'];
    if ($grade === 'again') {
        return [
            'bucket' => 'learning',
            'due' => $now + SRS_LEARNING_STEPS[0],
            'ease' => srs_clamp_ease($ease - 0.2),
            'intervalDays' => 0,
            'step' => 0,
            'reps' => 0,
            'lapses' => (int) $s['lapses'] + (($s['bucket'] ?? '') === 'new' ? 0 : 1),
            'lastReviewMs' => $now,
        ];
    }
    if ($grade === 'hard') {
        $step = max(0, (int) $s['step'] - 1);
        $delay = (int) (SRS_LEARNING_STEPS[min($step, count(SRS_LEARNING_STEPS) - 1)] * 1.5);
        return [
            'bucket' => 'learning',
            'due' => $now + $delay,
            'ease' => srs_clamp_ease($ease - 0.05),
            'intervalDays' => 0,
            'step' => $step,
            'reps' => (int) $s['reps'],
            'lapses' => (int) $s['lapses'],
            'lastReviewMs' => $now,
        ];
    }
    if ($grade === 'good') {
        $nextStep = ($s['bucket'] ?? '') === 'new' ? 0 : (int) $s['step'] + 1;
        if ($nextStep >= count(SRS_LEARNING_STEPS)) {
            return srs_graduate($now, $ease, (int) $prefs['graduatingIntervalDays'], 0);
        }
        return [
            'bucket' => 'learning',
            'due' => $now + SRS_LEARNING_STEPS[$nextStep],
            'ease' => $ease,
            'intervalDays' => 0,
            'step' => $nextStep,
            'reps' => (int) $s['reps'],
            'lapses' => (int) $s['lapses'],
            'lastReviewMs' => $now,
        ];
    }
    return srs_graduate($now, srs_clamp_ease($ease + 0.15), (int) $prefs['easyIntervalDays'], 0);
}

function srs_grade_relearn(array $s, string $grade, int $now, array $prefs): array
{
    if ($grade === 'again') {
        return array_merge($s, [
            'bucket' => 'relearn',
            'due' => $now + 10 * SRS_MINUTE,
            'ease' => srs_clamp_ease((float) $s['ease'] - 0.2),
            'intervalDays' => 0,
            'step' => 0,
            'lapses' => (int) $s['lapses'] + 1,
            'lastReviewMs' => $now,
        ]);
    }
    if ($grade === 'hard') {
        return array_merge($s, [
            'bucket' => 'relearn',
            'due' => $now + 12 * SRS_MINUTE,
            'ease' => srs_clamp_ease((float) $s['ease'] - 0.05),
            'intervalDays' => 0,
            'lastReviewMs' => $now,
        ]);
    }
    if ($grade === 'good') {
        $interval = max((int) $prefs['graduatingIntervalDays'], (int) (((int) $s['intervalDays']) * 0.5) ?: 1);
        return srs_graduate($now, srs_adjust_ease((float) $s['ease'], 'good'), $interval, (int) $s['reps']);
    }
    $interval = max((int) $prefs['easyIntervalDays'], (int) max(1, (int) $s['intervalDays']) * (float) $s['ease']);
    return srs_graduate($now, srs_adjust_ease((float) $s['ease'], 'easy'), (int) $interval, (int) $s['reps']);
}

function srs_grade_mature(array $s, string $grade, int $now, array $prefs): array
{
    $ease = (float) $s['ease'];
    $interval = max(1, (int) $s['intervalDays'] ?: 1);
    if ($grade === 'again') {
        return [
            'bucket' => 'relearn',
            'due' => $now + 10 * SRS_MINUTE,
            'ease' => srs_clamp_ease($ease - 0.2),
            'intervalDays' => 0,
            'step' => 0,
            'reps' => (int) $s['reps'],
            'lapses' => (int) $s['lapses'] + 1,
            'lastReviewMs' => $now,
        ];
    }
    if ($grade === 'hard') {
        $ease = srs_adjust_ease($ease, 'hard');
        $interval = max(1, (int) round($interval * 1.2));
        return srs_graduate($now, $ease, $interval, (int) $s['reps']);
    }
    if ($grade === 'good') {
        $ease = srs_adjust_ease($ease, 'good');
        if ((int) $s['reps'] === 0) {
            $interval = 1;
        } elseif ((int) $s['reps'] === 1) {
            $interval = 6;
        } else {
            $interval = max(1, (int) round($interval * $ease));
        }
        return srs_graduate($now, $ease, $interval, (int) $s['reps']);
    }
    $ease = srs_adjust_ease($ease, 'easy');
    $interval = max(1, (int) round($interval * $ease * 1.3));
    $interval = max($interval, (int) $prefs['easyIntervalDays']);
    return srs_graduate($now, $ease, $interval, (int) $s['reps']);
}

function srs_format_interval_hint(array $next, int $now): string
{
    $delta = (int) $next['due'] - $now;
    if ($delta <= 0) {
        return 'сейчас';
    }
    if ($delta < 60_000) {
        return max(1, (int) round($delta / 1000)) . ' сек';
    }
    if ($delta < SRS_DAY) {
        return max(1, (int) round($delta / SRS_MINUTE)) . ' мин';
    }
    $days = max(1, (int) round($delta / SRS_DAY));
    return $days . ' дн';
}
