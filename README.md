# AlexBelog Game Requests v2

Статический сайт под GitHub Pages с интеграцией Supabase.

## Что есть
- публичная очередь игр
- форма заявки
- фильтры и поиск
- ближайшие слоты
- админка через Supabase Auth
- сохранение заявок в Postgres через Supabase

## Быстрый старт

### 1. Создай проект в Supabase
- создай новый проект
- открой SQL Editor
- вставь содержимое `supabase.sql`
- выполни скрипт

### 2. Включи авторизацию
В Supabase Auth:
- создай пользователя для себя
- можно использовать email/password или magic link
- в URL Configuration добавь адрес GitHub Pages сайта в Redirect URLs

### 3. Укажи ключи
Открой `app.js` и замени:
- `PASTE_SUPABASE_URL`
- `PASTE_SUPABASE_ANON_KEY`

### 4. Загрузи на GitHub Pages
- создай репозиторий
- загрузи файлы в корень
- в GitHub: Settings -> Pages
- выбери `Deploy from a branch`
- ветка `main`, папка `/root`

## Структура
- `index.html` — интерфейс
- `styles.css` — стили
- `app.js` — логика фронта
- `supabase.sql` — схема БД и policies

## Как работает админка
- кнопка `Админ`
- вход через Supabase Auth
- после входа можно менять статус, приоритет, формат и дату слота

## Важно
- если ключи Supabase не заполнены, сайт запускается в demo mode через localStorage
- policy `public can read non-rejected requests` скрывает отклонённые заявки с публичной страницы
- для более строгой защиты можно потом вынести admin update/delete в Edge Functions
