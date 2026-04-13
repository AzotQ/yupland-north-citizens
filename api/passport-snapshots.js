import { Redis } from "@upstash/redis";

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
  });
}

function json(res, status, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(status).json(data);
}

function getRedis() {
  // Supports both Upstash Redis integration and Vercel KV env vars (KV is Upstash under the hood).
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function makeKey(contractAddress, title) {
  return `${contractAddress}::${title}`;
}

function nowIso() {
  return new Date().toISOString();
}

function diffWallets(prevWallets, nextWallets) {
  const prev = new Set(prevWallets);
  const next = new Set(nextWallets);

  const added = [];
  const removed = [];
  for (const w of next) if (!prev.has(w)) added.push(w);
  for (const w of prev) if (!next.has(w)) removed.push(w);

  added.sort((a, b) => a.localeCompare(b));
  removed.sort((a, b) => a.localeCompare(b));

  return { added, removed };
}

async function fetchPassportWallets({ contractAddress, title }) {
  const baseUrl = "https://api.sendler.xyz";
  const limit = 5000;
  let skip = 0;
  let wallets = [];

  const headers = {
    accept: "application/json",
    ...(process.env.SENDLER_API_KEY ? { "X-API-Key": process.env.SENDLER_API_KEY } : {}),
  };

  while (true) {
    const url =
      `${baseUrl}/nft/?contract_address=${encodeURIComponent(contractAddress)}` +
      `&title=${encodeURIComponent(title)}` +
      `&skip=${skip}&limit=${limit}`;

    // node-fetch is already a dependency in the project (used by other API route)
    const { default: fetch } = await import("node-fetch");
    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) throw new Error(`Sendler /nft/ error: ${res.status} ${res.statusText}`);
    const data = await res.json();
    const items = data?.items || [];

    for (const nft of items) {
      const owner = nft?.owner_id;
      if (typeof owner === "string" && owner.trim()) wallets.push(owner.trim());
    }

    if (items.length < limit) break;
    skip += limit;
  }

  wallets = Array.from(new Set(wallets)).sort((a, b) => a.localeCompare(b));
  return wallets;
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).end();
    }

    const contractAddress =
      (req.query?.contract_address || process.env.PASSPORT_CONTRACT_ADDRESS || "yuplandshop.mintbase1.near").trim();
    const title = (req.query?.title || "Passport - North Upland").trim();

    const redis = getRedis();
    if (!redis) {
      return json(res, 501, {
        error:
          "Snapshots storage is not configured. Connect Vercel KV (or Upstash Redis) so env vars KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN) are set.",
      });
    }

    const key = makeKey(contractAddress, title);
    const listKey = `passport:snapshots:list:${key}`;

    if (req.method === "GET") {
      const mode = (req.query?.mode || "latest").toString();

      if (mode === "list") {
        const ids = (await redis.lrange(listKey, 0, 49)) || [];
        return json(res, 200, { contract_address: contractAddress, title, snapshot_ids: ids });
      }

      // latest
      const latestId = await redis.lindex(listKey, 0);
      if (!latestId) {
        return json(res, 200, { contract_address: contractAddress, title, snapshot: null });
      }
      const snapshot = await redis.get(`passport:snapshot:${latestId}`);
      return json(res, 200, { contract_address: contractAddress, title, snapshot });
    }

    if (req.method === "POST") {
      const body = await readJson(req).catch(() => ({}));
      const bodyContract = (body?.contract_address || "").toString().trim();
      const bodyTitle = (body?.title || "").toString().trim();

      const effectiveContract = bodyContract || contractAddress;
      const effectiveTitle = bodyTitle || title;
      const effectiveKey = makeKey(effectiveContract, effectiveTitle);
      const effectiveListKey = `passport:snapshots:list:${effectiveKey}`;

      const wallets = await fetchPassportWallets({
        contractAddress: effectiveContract,
        title: effectiveTitle,
      });

      const prevId = await redis.lindex(effectiveListKey, 0);
      const prevSnapshot = prevId ? await redis.get(`passport:snapshot:${prevId}`) : null;
      const prevWallets = Array.isArray(prevSnapshot?.wallets) ? prevSnapshot.wallets : [];

      const snapshotId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const snapshot = {
        id: snapshotId,
        created_at: nowIso(),
        contract_address: effectiveContract,
        title: effectiveTitle,
        total: wallets.length,
        wallets,
      };

      const diff = diffWallets(prevWallets, wallets);

      await redis.set(`passport:snapshot:${snapshotId}`, snapshot);
      await redis.lpush(effectiveListKey, snapshotId);
      await redis.ltrim(effectiveListKey, 0, 199); // keep last 200 snapshots

      return json(res, 200, { snapshot, previous_snapshot_id: prevId || null, diff });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err?.message || String(err) });
  }
}

