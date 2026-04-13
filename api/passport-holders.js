import fetch from "node-fetch";

const cache = new Map();
const CACHE_TTL_MS = 60 * 1000;

const SENDLER_BASE_URL = "https://api.sendler.xyz";
const DEFAULT_TITLE = "Passport - North Upland";
const DEFAULT_CONTRACT = process.env.PASSPORT_CONTRACT_ADDRESS || "yuplandshop.mintbase1.near";

const API_KEY_FALLBACK = "";

function getApiKey() {
  return process.env.SENDLER_API_KEY || API_KEY_FALLBACK || undefined;
}

function buildHeaders() {
  const apiKey = getApiKey();
  return {
    accept: "application/json",
    ...(apiKey ? { "X-API-Key": apiKey } : {}),
  };
}

async function fetchAllNftsByTitle({ contractAddress, title }) {
  const limit = 5000;
  let skip = 0;
  let all = [];

  while (true) {
    const url =
      `${SENDLER_BASE_URL}/nft/?contract_address=${encodeURIComponent(contractAddress)}` +
      `&title=${encodeURIComponent(title)}` +
      `&skip=${skip}&limit=${limit}`;

    const res = await fetch(url, { method: "GET", headers: buildHeaders() });
    if (!res.ok) {
      throw new Error(`Sendler /nft/ error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const items = data?.items || [];
    all = all.concat(items);

    if (items.length < limit) break;
    skip += limit;
  }

  return all;
}

function pickTelegramUsername(user) {
  if (!user || typeof user !== "object") return "";
  const raw =
    user.telegram_username ??
    user.telegramUsername ??
    user.telegram ??
    user.tg_username ??
    user.tgUsername ??
    user.userName ??
    user.username ??
    user.user_name ??
    "";
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function pickTelegramId(user) {
  if (!user || typeof user !== "object") return null;
  const raw = user.telegramId ?? user.telegram_id ?? user.telegramID ?? null;
  if (raw === null || raw === undefined) return null;
  const asNumber = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(asNumber)) return null;
  return asNumber;
}

async function fetchUserByWallet(walletId) {
  const url = `${SENDLER_BASE_URL}/user/by-wallet/${encodeURIComponent(walletId)}`;
  const res = await fetch(url, { method: "GET", headers: buildHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sendler /user/by-wallet error: ${res.status} ${res.statusText}`);
  return await res.json();
}

async function fetchUserByTelegramId(telegramId) {
  const url = `${SENDLER_BASE_URL}/user/${encodeURIComponent(String(telegramId))}`;
  const res = await fetch(url, { method: "GET", headers: buildHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sendler /user/{telegram_id} error: ${res.status} ${res.statusText}`);
  return await res.json();
}

async function mapWithConcurrencyLimit(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export default async function handler(req, res) {
  try {
    const contractAddress = req.query.contract_address || DEFAULT_CONTRACT;
    const title = req.query.title || DEFAULT_TITLE;

    const cacheKey = `${contractAddress}|${title}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(200).json(cached.data);
    }

    const nfts = await fetchAllNftsByTitle({ contractAddress, title });

    const wallets = Array.from(
      new Set(
        nfts
          .map((nft) => nft?.owner_id)
          .filter((x) => typeof x === "string" && x.trim().length > 0)
          .map((x) => x.trim())
      )
    ).sort((a, b) => a.localeCompare(b));

    const users = await mapWithConcurrencyLimit(wallets, 10, async (walletId) => {
      const userByWallet = await fetchUserByWallet(walletId);

      // Some Sendler setups return only telegramId here; then we need to query /user/{telegram_id}.
      let telegram = pickTelegramUsername(userByWallet);
      if (!telegram) {
        const telegramId = pickTelegramId(userByWallet);
        if (telegramId !== null) {
          const userByTelegram = await fetchUserByTelegramId(telegramId);
          telegram = pickTelegramUsername(userByTelegram) || telegram;
        }
      }

      return { wallet_id: walletId, telegram_username: telegram };
    });

    const out = {
      contract_address: contractAddress,
      title,
      items: users,
    };

    cache.set(cacheKey, { timestamp: now, data: out });

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err?.message || String(err) });
  }
}

