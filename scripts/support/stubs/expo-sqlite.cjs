// expo-sqlite's async API over node:sqlite, one in-memory database per name and process
const { DatabaseSync } = require('node:sqlite');

const databases = new Map();

function wrap(raw) {
  const bind = (params) => (params || []).map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p));
  return {
    raw,
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, params) {
      const r = raw.prepare(sql).run(...bind(params));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getFirstAsync(sql, params) {
      const row = raw.prepare(sql).get(...bind(params));
      return row === undefined ? null : row;
    },
    async getAllAsync(sql, params) {
      return raw.prepare(sql).all(...bind(params));
    },
    async withTransactionAsync(fn) {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    async closeAsync() {},
  };
}

async function openDatabaseAsync(name) {
  if (!databases.has(name)) databases.set(name, wrap(new DatabaseSync(':memory:')));
  return databases.get(name);
}

module.exports = { openDatabaseAsync };
