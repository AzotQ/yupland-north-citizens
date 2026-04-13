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

### Переменные окружения

- **SENDLER_API_KEY**: API ключ для `api.sendler.xyz` (если на стороне Sendler включена проверка ключей).
- **PASSPORT_CONTRACT_ADDRESS**: контракт, где искать NFT “Passport - North Upland”.

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
