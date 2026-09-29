# CoreWords

Веб-приложение для изучения английских слов: уровни A1–C2 и тематические словари в MariaDB, SRS-прогресс на аккаунт, личные словари.

Стек: Vue 3 + Pinia + Vite на фронте, PHP 8.4 + MariaDB на бэке (база `CoreWords`). Хостинг назначения — обычный shared: **PHP + MySQL/MariaDB, без Node.js в рантайме**.

## Стек

- **Vue 3** (Composition API, `<script setup>`)
- **TypeScript**
- **Vite**
- **Pinia**
- **PHP 8.2+** (`pdo_mysql`, `mbstring`, `json`, `curl`)
- **MariaDB 11.4** / MySQL

## Установка (локально)

```bash
npm install
```

Скопируйте `api/config.example.php` в `api/config.local.php` и поправьте доступ к БД. Для локального HTTP поставьте `auth.secureCookie` в `false`.

Налейте схему: `sql/schema.sql` (чистая база) или миграцию `sql/migrations/002_auth_and_custom_dicts.sql` на уже существующую `CoreWords`.

Словарь импортируйте локально:

```bash
php api/tools/import-thematic.php
```

## Скрипты

| Команда      | Описание |
|-------------|----------|
| `npm run dev` | режим разработки (хост на всех интерфейсах, порт `5173`, прокси `/api`) |
| `npm run build` | проверка типов (`vue-tsc`) и production-сборка в `dist/` |
| `npm run preview` | предпросмотр собранной версии |
| `npm run lint` | ESLint для `.ts` и `.vue` |
| `npm run tunnel` | туннель к dev-серверу через `cloudflared` |

## Деплой на shared-хостинг

1. Локально: `npm run build`.
2. Залить на хостинг: содержимое `dist/`, каталог `api/` **без `api/tools/`**, корневые `index.php` и `.htaccess` (или эквивалент nginx).
3. Прогнать `sql/schema.sql` **или** миграцию, если база уже есть.
4. Создать `api/config.local.php` по образцу `api/config.example.php` (файл не в git).
5. Включить HTTPS. `auth.secureCookie` = `true`.
6. PHP ≥ 8.2, расширения `pdo_mysql`, `mbstring`, `json`, `curl`.

**Словарь импортировать локально и заливать дампом.** `api/tools/import-thematic.php` на shared-хостинге, скорее всего, упадёт по таймауту.

`api/config.local.php` закрыт правилом в `api/.htaccess`. На nginx `.htaccess` не читается — добавьте эквивалентный `location ~ ^/api/config.*\.php$ { deny all; }` в конфиг сайта.

Скрипты `api/tools/` (миграция, импорт) по HTTP отвечают только на запросы с localhost. Для запуска с другого адреса задайте `toolsToken` в конфиге и передайте `?token=...`. На прод их лучше не заливать вообще.

## Аккаунты

Регистрация и вход — email + пароль. Сессия в cookie `vd_session` на 90 дней (не сбрасывается при закрытии браузера).

После миграции существующая строка `users.id = 1` получает технический email `legacy@vocabdesk.local` и случайный непригодный для входа пароль, чтобы не развалить FK. Чтобы «забрать» этот прогресс:

- смените `email` / `password_hash` строки 1 напрямую в БД (`password_hash` через PHP `password_hash(...)`);
- или удалите строку 1, если прогресс не нужен (`ON DELETE CASCADE` уберёт связанные записи).

## Основные разделы

- **Главная** — кольцо дня, серия, прогресс по уровням A1–C2.
- **Словари** — общие наборы и личные списки, флаг «в обучении».
- **Учить** — сессии SRS.
- **Повторение / Изученное / Новое** — выборки по прогрессу.
- **Настройки** — SRS, тема, аккаунт, ключ Groq.

## Необязательный Groq

Ключ хранится в `user_settings` текущего пользователя (не в `.env` фронта). Вводится в «Данные и AI».
