/**
 * window.storage shim.
 *
 * App.jsx was written against the Claude artifact storage API. This backs the same
 * four methods with localStorage so the component runs unchanged locally.
 *
 * Contract (keep it if you swap the backend for Supabase):
 *   get(key, shared?)             -> { key, value, shared } | throws if missing
 *   set(key, value, shared?)      -> { key, value, shared }
 *   delete(key, shared?)          -> { key, deleted, shared }
 *   list(prefix?, shared?)        -> { keys, prefix, shared }
 * `value` is always a string. App.jsx JSON-stringifies before calling set.
 */
const ns = (key, shared) => `${shared ? "shared" : "user"}:${key}`;

window.storage = {
  async get(key, shared = false) {
    const value = localStorage.getItem(ns(key, shared));
    if (value === null) throw new Error(`No value for ${key}`);
    return { key, value, shared };
  },
  async set(key, value, shared = false) {
    localStorage.setItem(ns(key, shared), value);
    return { key, value, shared };
  },
  async delete(key, shared = false) {
    localStorage.removeItem(ns(key, shared));
    return { key, deleted: true, shared };
  },
  async list(prefix = "", shared = false) {
    const head = ns(prefix, shared);
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith(head))
      .map((k) => k.slice(shared ? 7 : 5));
    return { keys, prefix, shared };
  },
};
