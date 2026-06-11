import { spend } from './economy.js';
import { DASH_COOLDOWN } from '../data/constants.js';

// Catalog is data; costs/curves are launch values tuned here and nowhere else.
export const UPGRADES = {
  magnetDuration:  { name: 'Magnet+',    costs: [80, 200, 450],  effectLine: '+1.5s magnet per tier' },
  gearDuration:    { name: 'Gear+',      costs: [80, 200, 450],  effectLine: '+1.2s gear per tier' },
  dashCooldown:    { name: 'Quick Dash', costs: [100, 250, 500], effectLine: '−0.05s dash cooldown per tier' },
  startingRevives: { name: 'Guardian',   costs: [300, 700],      effectLine: 'start each run with +1 revive' },
  coinValue:       { name: 'Gold Rush',  costs: [150, 400, 800], effectLine: '+25% coin SCORE per tier' },
};

export function maxTier(id) { return UPGRADES[id].costs.length; }

// Junk-tolerant tier read: non-integers/negatives/unknown shapes read as 0;
// values above the ladder clamp to maxTier.
export function tierOf(saveData, id) {
  const t = saveData.upgrades?.[id];
  return Number.isInteger(t) && t > 0 ? Math.min(t, maxTier(id)) : 0;
}

export function nextCost(saveData, id) {
  const t = tierOf(saveData, id);
  return t >= maxTier(id) ? null : UPGRADES[id].costs[t];
}

export function canBuy(saveData, id) {
  const cost = nextCost(saveData, id);
  if (cost === null) return { ok: false, reason: 'maxed' };
  if (saveData.coins < cost) return { ok: false, reason: 'poor' };
  return { ok: true, reason: null };
}

export function buyUpgrade(saveData, id) {
  const check = canBuy(saveData, id);
  if (!check.ok) return false;
  spend(saveData, nextCost(saveData, id));
  saveData.upgrades[id] = tierOf(saveData, id) + 1;
  return true;
}

// Run-start snapshot, additive over base constants. coinValueMultiplier is a
// SCORE multiplier only — wallet banking uses raw coin counts (see bankRun).
export function effectsOf(saveData) {
  return {
    magnetDurationBonus: tierOf(saveData, 'magnetDuration') * 1.5,
    gearDurationBonus: tierOf(saveData, 'gearDuration') * 1.2,
    dashCooldown: Math.max(0.20, DASH_COOLDOWN - tierOf(saveData, 'dashCooldown') * 0.05),
    coinValueMultiplier: 1 + tierOf(saveData, 'coinValue') * 0.25,
    startingRevives: tierOf(saveData, 'startingRevives'),
  };
}
