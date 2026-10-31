const store = new Map();
const AsyncStorage = {
  getItem: async (k) => (store.has(k) ? store.get(k) : null),
  setItem: async (k, v) => void store.set(k, String(v)),
  removeItem: async (k) => void store.delete(k),
  multiRemove: async (keys) => keys.forEach((k) => store.delete(k)),
  getAllKeys: async () => [...store.keys()],
  clear: async () => store.clear(),
};
module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
