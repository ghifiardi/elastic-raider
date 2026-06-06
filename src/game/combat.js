import { COMBO_WINDOW, COMBO_MAX_MULT } from '../data/constants.js';

export function createCombo() { return { count: 0, timer: 0 }; }

export function registerSmash(combo) {
  combo.count += 1;
  combo.timer = COMBO_WINDOW;
}

export function tickCombo(combo, dt) {
  if (combo.count === 0) return;
  combo.timer -= dt;
  if (combo.timer <= 0) { combo.count = 0; combo.timer = 0; }
}

export function multiplier(combo) {
  return Math.min(COMBO_MAX_MULT, 1 + Math.floor(combo.count / 3));
}
