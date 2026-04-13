## Yupland North Citizens — Passport holders

Статическая страница + serverless API (Vercel), которая показывает список кошельков, у которых **есть NFT “Passport - North Upland”**, и подтягивает **никнейм Telegram** по кошельку через Sendler API.

### Что показывает

Таблица с колонками:

- **№**
- **кошелек** (NEAR wallet)
- **никнейм телеграм**

Никакие награды/очки не считаются.

### API

Используется спецификация Sendler: `https://api.sendler.xyz/openapi.json`.

#### Endpoint проекта

- **GET** `/api/passport-holders`
  - Query:
    - `contract_address` (optional) — NFT контракт. Если не передан, берётся `PASSPORT_CONTRACT_ADDRESS` (или дефолт в коде).
    - `title` (optional) — название NFT, по умолчанию `Passport - North Upland`.
  - Response:
    - `items`: массив `{ wallet_id, telegram_username }`

#### Снимки (snapshots) и изменения

Кнопка **“Сделать снимок”** сохраняет текущий список держателей (wallet_id) и показывает изменения относительно предыдущего снимка:

- **added**: у кого NFT появилась
- **removed**: у кого NFT пропала

Endpoint:

- **POST** `/api/passport-snapshots`
  - Body (JSON, optional):
    - `contract_address`
    - `title`
  - Response:
    - `snapshot`: `{ id, created_at, contract_address, title, total, wallets }`
    - `previous_snapshot_id`
    - `diff`: `{ added: string[], removed: string[] }`

### Переменные окружения

- **SENDLER_API_KEY**: API ключ для `api.sendler.xyz` (если на стороне Sendler включена проверка ключей).
- **PASSPORT_CONTRACT_ADDRESS**: контракт, где искать NFT “Passport - North Upland”.

Для снимков (хранение в Vercel KV / Upstash Redis):

Подойдут любые из вариантов (обычно они добавляются автоматически интеграцией):

- **Vercel KV**:
  - `KV_REST_API_URL`
  - `KV_REST_API_TOKEN`
- **Upstash Redis**:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`

### Локальный запуск

Проект сделан под Vercel (serverless функции в `api/`, статика в `public/`).

Самый простой способ локально:

1) Установить зависимости:

```bash
npm i
```

2) Поставить Vercel CLI (если нужно):

```bash
npm i -g vercel
```

3) Запустить:

```bash
vercel dev
```

После запуска откройте главную страницу (`/`) — там таблица. Контракт и название можно менять прямо в форме на странице.

### Настройка в Vercel (чтобы работали снимки)

1) **Создай проект в Vercel** и задеплой репозиторий.

2) В Vercel открой проект → **Storage** → создай/подключи **KV (Redis)**.

3) После подключения убедись, что в проекте появились env vars:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`

4) (Опционально) Добавь `SENDLER_API_KEY` и `PASSPORT_CONTRACT_ADDRESS` в **Project → Settings → Environment Variables**.

После этого кнопка **“Сделать снимок”** будет сохранять данные и показывать diff относительно предыдущего снимка.
