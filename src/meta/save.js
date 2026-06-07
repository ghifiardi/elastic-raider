const KEY = 'elastic-raider:save';
const CURRENT_VERSION = 2;

export function defaults() {
  return {
    version: CURRENT_VERSION,
    highScore: 0,
    coins: 0,
    unlocks: [],
    upgrades: {},
    missions: {},
    stats: { runs: 0, coinsBankedTotal: 0, distanceTotalM: 0, smashesTotal: 0, bestComboCount: 0 },
  };
}

// Forward migrators keyed by SOURCE version. Each maps vN → vN+1.
const MIGRATIONS = {
  1: (s) => ({
    version: 2,
    highScore: Number(s.highScore) || 0,
    coins: 0,
    unlocks: [],
    upgrades: {},
    missions: {},
    stats: { runs: 0, coinsBankedTotal: 0, distanceTotalM: 0, smashesTotal: 0, bestComboCount: 0 },
  }),
};

export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return defaults();
  let v = Math.floor(Number(raw.version) || 1); // missing/falsy/float version ⇒ floor to a valid step
  if (v > CURRENT_VERSION) return defaults(); // a save from a newer app; don't risk a bad downgrade
  let data = raw;
  while (v < CURRENT_VERSION) { data = MIGRATIONS[v](data); v += 1; }
  return fillDefaults(data);
}

// Rebuild the object from known keys only (evicting any unknown/legacy top-level
// fields) and deep-fill the nested `stats`. Uses ?? so legitimate 0/[]/{} are kept.
function fillDefaults(data) {
  const d = defaults();
  return {
    version: CURRENT_VERSION,
    highScore: data.highScore ?? d.highScore,
    coins: data.coins ?? d.coins,
    unlocks: data.unlocks ?? d.unlocks,
    upgrades: data.upgrades ?? d.upgrades,
    missions: data.missions ?? d.missions,
    stats: { ...d.stats, ...(data.stats || {}) },
  };
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

// Pure mutator on the in-memory save object. Parameter is `saveData` (NOT `save`)
// to avoid shadowing the exported save() function above.
export function updateHighScore(saveData, score) {
  if (score > saveData.highScore) { saveData.highScore = score; return true; }
  return false;
}
