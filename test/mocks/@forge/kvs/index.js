// In-memory Forge KVS for tests. Supports the subset the Skeptic uses.
const store = globalThis.__kvs || new Map();
const secrets = globalThis.__kvsSecrets || (globalThis.__kvsSecrets = new Map());
globalThis.__kvs = store;
const stats = (globalThis.__kvsStats = globalThis.__kvsStats || { get: 0, set: 0, del: 0, batch: 0, query: 0, failNextBatch: 0 });
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const kvs = {
  get: async (k) => {
    stats.get += 1;
    return clone(store.get(k));
  },
  set: async (k, v, opts = {}) => {
    stats.set += 1;
    if (opts.keyPolicy === 'FAIL_IF_EXISTS' && store.has(k)) throw new Error('KEY_ALREADY_EXISTS');
    // Real KVS limits a TTL to one year and a value to 240 KB; record TTLs so tests can check retention.
    if (opts.ttl) {
      const days = opts.ttl.unit === 'DAYS' ? opts.ttl.value : opts.ttl.unit === 'HOURS' ? opts.ttl.value / 24 : opts.ttl.value / 86400;
      if (!(days > 0) || days > 365) throw new Error('INVALID_TTL');
      (globalThis.__kvsTtl = globalThis.__kvsTtl || {})[k] = opts.ttl;
    }
    if (JSON.stringify(v ?? null).length > 240 * 1024) throw new Error('VALUE_TOO_LARGE');
    store.set(k, clone(v));
  },
  delete: async (k) => {
    store.delete(k);
  },
  batchSet: async (items) => {
    stats.batch += 1;
    if (stats.failNextBatch > 0) {
      stats.failNextBatch -= 1;
      throw new Error('simulated batch failure');
    }
    if (items.length > 25) throw new Error('batch too large');
    for (const { key, value } of items) store.set(key, clone(value));
    return { successfulKeys: items.map(({ key }) => ({ key })), failedKeys: [] };
  },
  batchGet: async (items) => {
    if (items.length > 25) throw new Error('batch too large');
    return { successfulKeys: items.filter(({ key }) => store.has(key)).map(({ key }) => ({ key, value: clone(store.get(key)) })), failedKeys: [] };
  },
  batchDelete: async (items) => {
    if (items.length > 25) throw new Error('batch too large');
    for (const { key } of items) store.delete(key);
    return { successfulKeys: items.map(({ key }) => ({ key })), failedKeys: [] };
  },
  getSecret: async (k) => clone(secrets.get(k)),
  setSecret: async (k, v) => {
    secrets.set(k, clone(v));
  },
  deleteSecret: async (k) => {
    secrets.delete(k);
  },
  query: () => {
    let prefix = '';
    let lim = 100;
    let cur = 0;
    const q = {
      where: (_k, c) => {
        prefix = c.prefix;
        return q;
      },
      limit: (n) => {
        lim = n;
        return q;
      },
      cursor: (c) => {
        cur = Number(c) || 0;
        return q;
      },
      getMany: async () => {
        stats.query += 1;
        const all = [...store.entries()].filter(([k]) => k.startsWith(prefix)).sort((a, b) => a[0].localeCompare(b[0]));
        const page = all.slice(cur, cur + lim);
        return { results: page.map(([key, value]) => ({ key, value: clone(value) })), nextCursor: cur + lim < all.length ? String(cur + lim) : undefined };
      },
    };
    return q;
  },
};
module.exports = { __esModule: true, kvs, default: kvs, WhereConditions: { beginsWith: (p) => ({ prefix: p }) } };
