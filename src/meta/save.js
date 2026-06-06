const KEY = 'elastic-raider:save';
const VERSION = 1;

export function defaults() { return { version: VERSION, highScore: 0 }; }

export function migrate(raw) {
  const base = defaults();
  if (!raw || typeof raw !== 'object') return base;
  return { version: VERSION, highScore: Number(raw.highScore) || 0 };
}

export function load(adapter) {
  const text = adapter.getItem(KEY);
  if (!text) return defaults();
  try { return migrate(JSON.parse(text)); }
  catch { return defaults(); }
}

export function save(adapter, data) {
  adapter.setItem(KEY, JSON.stringify(migrate(data)));
}

export function recordHighScore(adapter, score) {
  const data = load(adapter);
  if (score > data.highScore) { data.highScore = score; save(adapter, data); }
  return data.highScore;
}
