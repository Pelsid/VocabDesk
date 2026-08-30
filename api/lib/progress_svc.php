<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/srs.php';
require_once __DIR__ . '/settings.php';

function progress_row_to_schedule(array $row): array
{
    $sched = [
        'bucket' => $row['bucket'],
        'due' => (int) $row['due_ms'],
        'ease' => (float) $row['ease'],
        'intervalDays' => (int) $row['interval_days'],
        'step' => (int) $row['step'],
        'reps' => (int) $row['reps'],
        'lapses' => (int) $row['lapses'],
    ];
    if ($row['last_review_ms'] !== null) {
        $sched['lastReviewMs'] = (int) $row['last_review_ms'];
    }
    return $sched;
}

function progress_snapshot(int $userId): array
{
    $stmt = db()->prepare('SELECT * FROM word_progress WHERE user_id = ?');
    $stmt->execute([$userId]);
    $words = [];
    $mastered = [];
    foreach ($stmt as $row) {
        $id = (string) $row['word_id'];
        if ((int) $row['mastered'] === 1) {
            $mastered[$id] = true;
        }
        $words[$id] = progress_row_to_schedule($row);
    }
    $weakRaw = settings_get($userId, 'weak_word_log');
    $weak = [];
    if ($weakRaw) {
        $parsed = json_decode($weakRaw, true);
        if (is_array($parsed)) {
            $weak = $parsed;
        }
    }
    return [
        'v' => 1,
        'words' => $words,
        'prefs' => settings_prefs($userId),
        'mastered' => $mastered,
        'weakWordLog' => $weak,
    ];
}

function progress_upsert(int $userId, int $wordId, array $sched, bool $mastered = false): void
{
    $stmt = db()->prepare(
        'INSERT INTO word_progress
            (user_id, word_id, bucket, due_ms, ease, interval_days, step, reps, lapses, last_review_ms, mastered)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            bucket = VALUES(bucket),
            due_ms = VALUES(due_ms),
            ease = VALUES(ease),
            interval_days = VALUES(interval_days),
            step = VALUES(step),
            reps = VALUES(reps),
            lapses = VALUES(lapses),
            last_review_ms = VALUES(last_review_ms),
            mastered = VALUES(mastered)',
    );
    $stmt->execute([
        $userId,
        $wordId,
        $sched['bucket'],
        (int) $sched['due'],
        $sched['ease'],
        (int) $sched['intervalDays'],
        (int) $sched['step'],
        (int) $sched['reps'],
        (int) $sched['lapses'],
        $sched['lastReviewMs'] ?? null,
        $mastered ? 1 : 0,
    ]);
}

function progress_load_one(int $userId, int $wordId): ?array
{
    $stmt = db()->prepare('SELECT * FROM word_progress WHERE user_id = ? AND word_id = ?');
    $stmt->execute([$userId, $wordId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function progress_append_weak(int $userId, int $wordId, string $grade): array
{
    if ($grade !== 'again' && $grade !== 'hard') {
        $raw = settings_get($userId, 'weak_word_log');
        $log = $raw ? (json_decode($raw, true) ?: []) : [];
        return is_array($log) ? $log : [];
    }
    $raw = settings_get($userId, 'weak_word_log');
    $log = $raw ? (json_decode($raw, true) ?: []) : [];
    if (!is_array($log)) {
        $log = [];
    }
    $log = array_values(array_filter($log, static fn($x) => !is_array($x) || (int) ($x['id'] ?? 0) !== $wordId));
    $log[] = ['id' => $wordId, 'g' => $grade, 'at' => (int) round(microtime(true) * 1000)];
    $log = array_slice($log, -200);
    settings_set($userId, 'weak_word_log', json_encode($log, JSON_UNESCAPED_UNICODE));
    return $log;
}

function progress_bump_daily(int $userId): array
{
    $day = (new DateTimeImmutable('now'))->format('Y-m-d');
    $stmt = db()->prepare(
        'INSERT INTO daily_stats (user_id, day, cards_done) VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE cards_done = cards_done + 1',
    );
    $stmt->execute([$userId, $day]);
    return daily_payload($userId);
}

function daily_payload(int $userId): array
{
    $stmt = db()->prepare(
        'SELECT day, cards_done FROM daily_stats WHERE user_id = ? ORDER BY day DESC LIMIT 400',
    );
    $stmt->execute([$userId]);
    $days = [];
    $today = (new DateTimeImmutable('now'))->format('Y-m-d');
    $todayCount = 0;
    foreach ($stmt as $row) {
        $d = (string) $row['day'];
        $n = (int) $row['cards_done'];
        if ($n > 0) {
            $days[] = $d;
        }
        if ($d === $today) {
            $todayCount = $n;
        }
    }
    sort($days);
    return [
        'todayCount' => $todayCount,
        'days' => $days,
        'streak' => daily_streak($days, $today, $todayCount),
        'weekFlags' => daily_week_flags($days, $todayCount > 0 ? $today : null),
    ];
}

function daily_streak(array $days, string $today, int $todayCount): int
{
    $set = array_fill_keys($days, true);
    if ($todayCount > 0) {
        $set[$today] = true;
    }
    $cursor = isset($set[$today]) ? $today : (new DateTimeImmutable($today))->modify('-1 day')->format('Y-m-d');
    if (!isset($set[$cursor])) {
        return 0;
    }
    $streak = 0;
    while (isset($set[$cursor])) {
        $streak++;
        $cursor = (new DateTimeImmutable($cursor))->modify('-1 day')->format('Y-m-d');
    }
    return $streak;
}

function daily_week_flags(array $days, ?string $todayIfDone): array
{
    $set = array_fill_keys($days, true);
    if ($todayIfDone) {
        $set[$todayIfDone] = true;
    }
    $now = new DateTimeImmutable('now');
    $dow = (int) $now->format('N'); // 1=Mon
    $monday = $now->modify('-' . ($dow - 1) . ' days');
    $flags = [];
    for ($i = 0; $i < 7; $i++) {
        $d = $monday->modify("+{$i} days")->format('Y-m-d');
        $flags[] = isset($set[$d]);
    }
    return $flags;
}

function progress_reset(int $userId): void
{
    $pdo = db();
    $pdo->prepare('DELETE FROM word_progress WHERE user_id = ?')->execute([$userId]);
    $pdo->prepare('DELETE FROM daily_stats WHERE user_id = ?')->execute([$userId]);
    settings_set($userId, 'weak_word_log', '[]');
}

function progress_grade(int $userId, int $wordId, string $grade): array
{
    $allowed = ['again', 'hard', 'good', 'easy'];
    if (!in_array($grade, $allowed, true)) {
        json_error('Неизвестная оценка');
    }
    $exists = db()->prepare('SELECT 1 FROM words WHERE id = ?');
    $exists->execute([$wordId]);
    if (!$exists->fetchColumn()) {
        json_error('Слово не найдено', 404);
    }
    $prefs = settings_prefs($userId);
    $now = (int) round(microtime(true) * 1000);
    $row = progress_load_one($userId, $wordId);
    $prev = $row ? progress_row_to_schedule($row) : null;
    $mastered = $row ? (int) $row['mastered'] === 1 : false;
    $next = srs_apply($prev, $grade, $now, $prefs);
    progress_upsert($userId, $wordId, $next, $mastered);
    $weak = progress_append_weak($userId, $wordId, $grade);
    $daily = progress_bump_daily($userId);
    return [
        'wordId' => $wordId,
        'schedule' => $next,
        'mastered' => $mastered,
        'weakWordLog' => $weak,
        'daily' => $daily,
    ];
}

function progress_master(int $userId, int $wordId): array
{
    $now = (int) round(microtime(true) * 1000);
    $row = progress_load_one($userId, $wordId);
    $sched = $row ? progress_row_to_schedule($row) : srs_default_new($now);
    $sched['lastReviewMs'] = $now;
    progress_upsert($userId, $wordId, $sched, true);
    $daily = progress_bump_daily($userId);
    return [
        'wordId' => $wordId,
        'schedule' => $sched,
        'mastered' => true,
        'daily' => $daily,
    ];
}
