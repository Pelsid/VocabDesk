<?php

declare(strict_types=1);

/**
 * Импорт общего каталога из раздела «Тематические словари».
 * CLI: php api/tools/import-thematic.php
 * Не трогает пользователей, личные словари и свои слова.
 */

set_time_limit(0);

$root = dirname(__DIR__, 2);
require_once dirname(__DIR__) . '/lib/db.php';

require_local_or_token();

$isCli = PHP_SAPI === 'cli';
if (!$isCli && ($_GET['run'] ?? '') !== '1') {
    header('Content-Type: text/plain; charset=utf-8');
    echo "Добавьте ?run=1 чтобы заменить общий каталог.\n";
    exit;
}

function out(string $msg): void
{
    echo $msg, PHP_SAPI === 'cli' ? PHP_EOL : "<br>\n";
    @flush();
}

/** @return array<string, string> имя темы => id */
function theme_slugs(): array
{
    return [
        'Анатомия' => 'anatomy',
        'Археология' => 'archaeology',
        'Архитектура' => 'architecture',
        'Бизнес' => 'business',
        'Внешность' => 'appearance',
        'Военное дело, оружие' => 'military_weapons',
        'Время, календарь' => 'time_calendar',
        'География' => 'geography',
        'Город' => 'town',
        'Деньги' => 'money',
        'Деревья, кустарники' => 'trees',
        'Дом, вещи' => 'home',
        'Еда' => 'food',
        'Животные' => 'animals',
        'Здоровье' => 'health',
        'Искусство' => 'art',
        'Карьера' => 'career',
        'Кино' => 'movie',
        'Компьютер' => 'computer',
        'Космос' => 'space',
        'Литература' => 'literature',
        'Магазины' => 'shops',
        'Маркетинг' => 'marketing',
        'Математика' => 'math',
        'Мебель' => 'furniture',
        'Музыка' => 'music',
        'Одежда' => 'clothing',
        'Политика' => 'politics',
        'Психология' => 'psychology',
        'Путешествия' => 'travel',
        'Рыба' => 'fish',
        'Семья' => 'family',
        'СМИ' => 'mass_media',
        'Социальные сети' => 'social_networks',
        'Спорт' => 'sport',
        'Строительство' => 'construction',
        'Транспорт' => 'transport',
        'Фотография' => 'photography',
        'Характер' => 'character',
        'Хобби' => 'hobby',
        'Цвета' => 'colors',
        'Цветы' => 'flowers',
        'Числа' => 'numbers',
        'Экология' => 'ecology',
        'Экономика' => 'economy',
        'Юриспруденция' => 'legal_english',
        'Образование' => 'education',
        'Погода' => 'weather',
        'Природа' => 'nature',
        'Эмоции' => 'emotions',
        'Религия' => 'religion',
        'Наука' => 'science',
        'Общение' => 'communication',
        'Общество' => 'society',
        'Служебные слова' => 'function_words',
        'Общая лексика' => 'general',
    ];
}

function pos_bit(string $label): int
{
    return match ($label) {
        'существительное' => 1,
        'глагол' => 2,
        'прилагательное' => 4,
        'наречие' => 8,
        'местоимение' => 16,
        'предлог' => 32,
        'союз' => 64,
        'междометие' => 128,
        'артикль' => 256,
        'числительное' => 512,
        'частица' => 1024,
        'причастие' => 2048,
        default => 0,
    };
}

/** @return list<string> */
function template_patterns(): array
{
    return [
        '/^This is (?:a |an |the |some )?.+\.$/iu',
        '/^She described (?:a |an |the )?.+\.$/iu',
        '/^We talked about (?:a |an |the )?.+\.$/iu',
        '/^The result is .+\.$/iu',
        '/^We need (?:a |an |the ).+ plan\.$/iu',
        '/^His answer was .+\.$/iu',
        '/^I want to .+\.$/iu',
        '/^She decided to .+\.$/iu',
        '/^They tried to .+\.$/iu',
        '/^They .+ finished the work\.$/iu',
        '/^She .+ agreed\.$/iu',
        '/^It .+ worked\.$/iu',
        '/^This job uses the word .+\.$/iu',
        '/^She bought (?:a |an |the |some )?.+\.$/iu',
        '/^The .+ is in the house\.$/iu',
        '/^The doctor mentioned .+\.$/iu',
        '/^The doctor checked .+\.$/iu',
        '/^We use .+ at school\.$/iu',
        '/^For lunch we have .+\.$/iu',
        '/^This feeling is .+\.$/iu',
        '/^We saw .+\.$/iu',
        '/^We use .+ to travel\.$/iu',
        '/^The .+ is used in sport\.$/iu',
        '/^The .+ is about money\.$/iu',
        '/^She asked me to .+\.$/iu',
        '/^(?:A|An|The) child can recognize .+\.$/iu',
        '/^This animal is (?:a |an |the )?.+\.$/iu',
        '/^I opened .+ on the computer\.$/iu',
        '/^The .+ is part of the body\.$/iu',
        '/^This person is my .+\.$/iu',
        '/^We listened to .+\.$/iu',
        '/^I would call it .+\.$/iu',
        '/^Everyone agreed it was .+\.$/iu',
        '/^You can see .+ in the city\.$/iu',
        '/^Please use .+ in (?:a |an |the )?sentence\.$/iu',
        '/^The number is .+\.$/iu',
        '/^I chose .+\.$/iu',
        '/^Write the number .+\.$/iu',
        '/^It is time to .+\.$/iu',
        '/^They learn to .+\.$/iu',
        '/^At work she has to .+\.$/iu',
        '/^She said ["«].+["»]\.?$/iu',
        '/^The word .+ means .+$/iu',
        '/^.+!$/u',
    ];
}

function is_template_example(string $english): bool
{
    $english = trim($english);
    if ($english === '') {
        return true;
    }
    foreach (template_patterns() as $re) {
        if (preg_match($re, $english) === 1) {
            return true;
        }
    }
    return false;
}

/**
 * @return array{
 *   words: array<string, array{lemma:string,rus:list<string>,ipa:string,pos:int,levels:array<string,true>,dicts:array<string,true>,examples:list<array{o:string,t:string}>}>,
 *   themes: list<array{id:string,name:string}>,
 *   stats: array{entries:int,templates:int,kept:int,unknownPos:int,unknownLinks:int}
 * }
 */
function parse_thematic(string $path): array
{
    $raw = file_get_contents($path);
    if ($raw === false) {
        throw new RuntimeException('Не удалось прочитать ' . $path);
    }
    $lines = preg_split('/\R/u', $raw) ?: [];
    $start = null;
    foreach ($lines as $i => $line) {
        if (trim($line) === '## Тематические словари') {
            $start = $i;
            break;
        }
    }
    if ($start === null) {
        throw new RuntimeException('В файле нет раздела «Тематические словари».');
    }

    $slugs = theme_slugs();
    $dash = "\u{2014}";
    $headRe = '/^(.+?) ' . $dash . ' ((?:A1|A2|B1|B2|C1|C2)(?:\s*,\s*(?:A1|A2|B1|B2|C1|C2))*) ' . $dash . ' (.+)$/u';
    $levelOrder = ['A1' => 1, 'A2' => 2, 'B1' => 3, 'B2' => 4, 'C1' => 5, 'C2' => 6];

    $theme = null;
    $themeId = null;
    $themes = [];
    $seenThemes = [];
    $cur = null;
    $words = [];
    $stats = ['entries' => 0, 'templates' => 0, 'kept' => 0, 'unknownPos' => 0, 'unknownLinks' => 0];

    $flush = function () use (&$cur, &$words, &$stats, $levelOrder, $slugs, $dash): void {
        if ($cur === null) {
            return;
        }
        if (!preg_match($cur['re'], $cur['head'], $m)) {
            throw new RuntimeException('Не разобрана строка: ' . $cur['head']);
        }
        $lemma = trim($m[1]);
        $key = mb_strtolower($lemma);
        $levels = array_map('trim', explode(',', $m[2]));
        $rest = $m[3];
        $linkNames = [];
        $mark = 'связи:';
        $posMark = mb_strpos($rest, $mark);
        if ($posMark !== false) {
            $linkNames = array_values(array_filter(array_map('trim', explode(';', mb_substr($rest, $posMark + mb_strlen($mark))))));
        }

        if (!isset($words[$key])) {
            $words[$key] = [
                'lemma' => $lemma,
                'rus' => [],
                'ipa' => '',
                'pos' => 0,
                'levels' => [],
                'dicts' => [],
                'examples' => [],
                'exampleKeys' => [],
            ];
        }
        $row = &$words[$key];
        $rus = trim((string) ($cur['rus'] ?? ''));
        if ($rus !== '' && !in_array($rus, $row['rus'], true)) {
            $row['rus'][] = $rus;
        }
        $ipa = trim((string) ($cur['ipa'] ?? ''));
        if ($row['ipa'] === '' && $ipa !== '') {
            $row['ipa'] = $ipa;
        }
        $bit = pos_bit(trim((string) ($cur['pos'] ?? '')));
        if ($bit === 0 && trim((string) ($cur['pos'] ?? '')) !== '') {
            $stats['unknownPos']++;
        }
        $row['pos'] |= $bit;
        foreach ($levels as $lv) {
            if (isset($levelOrder[$lv])) {
                $row['levels'][$lv] = true;
            }
        }
        if ($cur['themeId'] !== null) {
            $row['dicts'][$cur['themeId']] = true;
        }
        foreach ($linkNames as $name) {
            if (!isset($slugs[$name])) {
                $stats['unknownLinks']++;
                continue;
            }
            $row['dicts'][$slugs[$name]] = true;
        }
        foreach ($levels as $lv) {
            if (isset($levelOrder[$lv])) {
                $row['dicts']['level_' . strtolower($lv)] = true;
            }
        }
        foreach ($cur['ex'] as $ex) {
            $parts = explode(' ' . $dash . ' ', $ex, 2);
            $en = trim($parts[0] ?? '');
            $ru = trim($parts[1] ?? '');
            if (is_template_example($en)) {
                $stats['templates']++;
                continue;
            }
            $ek = mb_strtolower($en);
            if ($ek === '' || isset($row['exampleKeys'][$ek])) {
                continue;
            }
            $row['exampleKeys'][$ek] = true;
            $row['examples'][] = ['o' => $en, 't' => $ru];
            $stats['kept']++;
        }
        $stats['entries']++;
        unset($row);
        $cur = null;
    };

    for ($i = $start + 1, $n = count($lines); $i < $n; $i++) {
        $line = $lines[$i];
        if (str_starts_with($line, '## ')) {
            $flush();
            $theme = trim(substr($line, 3));
            if (!isset($slugs[$theme])) {
                throw new RuntimeException('Нет slug для темы: ' . $theme);
            }
            $themeId = $slugs[$theme];
            if (!isset($seenThemes[$themeId])) {
                $seenThemes[$themeId] = true;
                $themes[] = ['id' => $themeId, 'name' => $theme];
            }
            continue;
        }
        if (str_starts_with($line, '  - ')) {
            if ($cur !== null) {
                $cur['ex'][] = trim(substr($line, 4));
            }
            continue;
        }
        if (str_starts_with($line, '  ') && str_contains($line, ':')) {
            if ($cur === null) {
                continue;
            }
            $idx = strpos($line, ':');
            $label = trim(substr($line, 2, $idx - 2));
            $val = trim(substr($line, $idx + 1));
            if ($label === 'часть речи') {
                $cur['pos'] = $val;
            } elseif ($label === 'перевод') {
                $cur['rus'] = $val;
            } elseif ($label === 'транскрипция') {
                $cur['ipa'] = $val;
            }
            continue;
        }
        if ($line !== '' && !str_starts_with($line, ' ') && !str_starts_with($line, '#') && str_contains($line, ' ' . $dash . ' ')) {
            $flush();
            $cur = [
                'head' => trim($line),
                're' => $headRe,
                'themeId' => $themeId,
                'pos' => '',
                'rus' => '',
                'ipa' => '',
                'ex' => [],
            ];
        }
    }
    $flush();

    if (count($themes) !== 56) {
        throw new RuntimeException('Ожидалось 56 тем, разобрано ' . count($themes));
    }

    return ['words' => $words, 'themes' => $themes, 'stats' => $stats];
}

function kind_type(PDO $pdo): string
{
    $col = $pdo->query("SHOW COLUMNS FROM dictionaries LIKE 'kind'")->fetch();
    return strtolower((string) ($col['Type'] ?? ''));
}

function widen_kind(PDO $pdo): void
{
    if (!str_contains(kind_type($pdo), "'level'")) {
        $pdo->exec(
            "ALTER TABLE dictionaries MODIFY kind ENUM('oxford','level','thematic','other') NOT NULL DEFAULT 'thematic'",
        );
        out('ENUM kind расширен: добавлен level.');
    }
}

function narrow_kind(PDO $pdo): void
{
    if (!str_contains(kind_type($pdo), "'oxford'")) {
        return;
    }
    $pdo->exec("UPDATE dictionaries SET kind = 'thematic' WHERE kind = 'oxford'");
    $pdo->exec(
        "ALTER TABLE dictionaries MODIFY kind ENUM('level','thematic','other') NOT NULL DEFAULT 'thematic'",
    );
    out('ENUM kind сужен: oxford убран.');
}

try {
    $md = $root . '/English_Vocabulary_A1-C2_Thematic_Networks_fixed.md';
    if (!is_file($md)) {
        throw new RuntimeException('Нет файла каталога: ' . $md);
    }
    out('Читаю ' . $md);
    $parsed = parse_thematic($md);
    $stats = $parsed['stats'];
    out(sprintf(
        'Вхождений: %d. Лемм: %d. Примеров отброшено: %d, оставлено: %d. Неизвестных связей: %d.',
        $stats['entries'],
        count($parsed['words']),
        $stats['templates'],
        $stats['kept'],
        $stats['unknownLinks'],
    ));
    if ($stats['unknownPos'] > 0) {
        out('Неизвестных частей речи: ' . $stats['unknownPos']);
    }

    $pdo = db();
    widen_kind($pdo);

    $pdo->beginTransaction();
    $pdo->exec('DELETE FROM dictionaries WHERE owner_user_id IS NULL');
    $pdo->exec('DELETE FROM words WHERE owner_user_id IS NULL');
    out('Старый общий каталог удалён.');

    $insDict = $pdo->prepare(
        'INSERT INTO dictionaries (id, name_ru, kind, cefr, is_selected, sort_order, icon_key)
         VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    $levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    foreach ($levels as $i => $lv) {
        $insDict->execute(['level_' . strtolower($lv), $lv, 'level', $lv, 1, ($i + 1) * 10, null]);
    }
    foreach ($parsed['themes'] as $i => $theme) {
        $insDict->execute([$theme['id'], $theme['name'], 'thematic', null, 0, 100 + $i * 10, null]);
    }
    out('Словари: 6 уровней и ' . count($parsed['themes']) . ' тем.');

    $used = [];
    foreach ($pdo->query('SELECT id FROM words WHERE id < 10000000') as $row) {
        $used[(int) $row['id']] = true;
    }
    $nextId = 1;
    $alloc = function () use (&$nextId, &$used): int {
        while (isset($used[$nextId])) {
            $nextId++;
        }
        if ($nextId >= 10000000) {
            throw new RuntimeException('Нет свободных id ниже 10000000.');
        }
        $id = $nextId;
        $used[$id] = true;
        $nextId++;
        return $id;
    };

    $insWord = $pdo->prepare(
        'INSERT INTO words (id, owner_user_id, lemma, rus, transcription, pos, examples_rus)
         VALUES (?, NULL, ?, ?, ?, ?, ?)',
    );
    $insLink = $pdo->prepare('INSERT IGNORE INTO dictionary_words (dictionary_id, word_id) VALUES (?, ?)');
    $wordCount = 0;
    $linkCount = 0;
    foreach ($parsed['words'] as $row) {
        $id = $alloc();
        $rus = $row['rus'] === [] ? null : implode('; ', $row['rus']);
        $ipa = $row['ipa'] !== '' ? $row['ipa'] : null;
        if ($ipa !== null && mb_strlen($ipa) > 512) {
            $ipa = mb_substr($ipa, 0, 512);
        }
        $pos = $row['pos'] > 0 ? $row['pos'] : null;
        $examples = $row['examples'] === []
            ? null
            : json_encode($row['examples'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $insWord->execute([$id, $row['lemma'], $rus, $ipa, $pos, $examples]);
        $wordCount++;
        $dicts = array_keys($row['dicts']);
        foreach ($dicts as $dictId) {
            $insLink->execute([$dictId, $id]);
            $linkCount++;
        }
    }
    out("Слов: {$wordCount}. Связей: {$linkCount}.");

    $pdo->exec(
        'INSERT INTO user_dictionary_state (user_id, dictionary_id, is_selected)
         SELECT u.id, d.id, 1
           FROM users u
           JOIN dictionaries d ON d.owner_user_id IS NULL AND d.kind = \'level\'',
    );

    $valid = [];
    foreach ($pdo->query('SELECT id FROM dictionaries') as $row) {
        $valid[(string) $row['id']] = true;
    }
    $prefsStmt = $pdo->query("SELECT user_id, setting_value FROM user_settings WHERE setting_key = 'prefs'");
    $updPrefs = $pdo->prepare('UPDATE user_settings SET setting_value = ? WHERE user_id = ? AND setting_key = \'prefs\'');
    $prefsFixed = 0;
    foreach ($prefsStmt as $prefRow) {
        $prefs = json_decode((string) $prefRow['setting_value'], true);
        if (!is_array($prefs) || !isset($prefs['customCategoryIds']) || !is_array($prefs['customCategoryIds'])) {
            continue;
        }
        $filtered = array_values(array_filter(
            $prefs['customCategoryIds'],
            static fn ($id) => isset($valid[(string) $id]),
        ));
        if ($filtered === array_values($prefs['customCategoryIds'])) {
            continue;
        }
        $prefs['customCategoryIds'] = $filtered;
        $updPrefs->execute([
            json_encode($prefs, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            (int) $prefRow['user_id'],
        ]);
        $prefsFixed++;
    }
    out('Настройки: убраны устаревшие словари у ' . $prefsFixed . ' пользователей.');

    $pdo->commit();
    narrow_kind($pdo);

    $levelN = (int) $pdo->query("SELECT COUNT(*) FROM dictionaries WHERE owner_user_id IS NULL AND kind = 'level'")->fetchColumn();
    $themeN = (int) $pdo->query("SELECT COUNT(*) FROM dictionaries WHERE owner_user_id IS NULL AND kind = 'thematic'")->fetchColumn();
    $wordsN = (int) $pdo->query('SELECT COUNT(*) FROM words WHERE owner_user_id IS NULL')->fetchColumn();
    $arm = $pdo->query(
        "SELECT w.lemma, w.rus, w.transcription, w.examples_rus,
                GROUP_CONCAT(d.cefr ORDER BY d.sort_order SEPARATOR ' · ') AS levels
           FROM words w
           JOIN dictionary_words dw ON dw.word_id = w.id
           JOIN dictionaries d ON d.id = dw.dictionary_id AND d.kind = 'level'
          WHERE w.owner_user_id IS NULL AND w.lemma = 'arm'
          GROUP BY w.id",
    )->fetch();
    out("Проверка: уровней {$levelN}, тем {$themeN}, общих слов {$wordsN}.");
    if ($arm) {
        $ex = $arm['examples_rus'];
        $exText = $ex === null || $ex === '' || $ex === 'null' ? 'пусто' : (string) $ex;
        out('arm: ' . $arm['levels'] . ' / ' . $arm['rus'] . ' / ' . $arm['transcription'] . ' / примеры: ' . $exText);
    } else {
        out('arm: не найден');
    }
    out('Импорт завершён.');
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    out('Ошибка: ' . $e->getMessage());
    exit(1);
}
