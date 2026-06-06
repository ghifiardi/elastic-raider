import { COIN_SCORE, SMASH_SCORE } from '../data/constants.js';

export function createScore() {
  return { distance: 0, coins: 0, smashes: 0, bonus: 0 };
}
export function addDistance(score, meters) { score.distance += meters; }
export function addCoin(score, multiplier) { score.coins += 1; score.bonus += COIN_SCORE * multiplier; }
export function addSmash(score, multiplier) { score.smashes += 1; score.bonus += SMASH_SCORE * multiplier; }
export function total(score) { return Math.floor(score.distance) + score.bonus; }
