// Returns a {getItem, setItem} adapter. Uses localStorage when usable,
// otherwise an in-memory Map (Node, private-mode failures, quota errors).
export function createStorage() {
  if (localStorageUsable()) {
    return {
      getItem: (k) => { try { return window.localStorage.getItem(k); } catch { return null; } },
      setItem: (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* ignore */ } },
    };
  }
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
  };
}

function localStorageUsable() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const t = '__er_probe__';
    window.localStorage.setItem(t, t);
    window.localStorage.removeItem(t);
    return true;
  } catch { return false; }
}
