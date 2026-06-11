import { COIN_SCORE, SMASH_SCORE } from '../data/constants.js';

export function createScore() {
  return { distance: 0, coins: 0, smashes: 0, bonus: 0 };
}
export function addDistance(score, meters) { score.distance += meters; }
export function addCoin(score, multiplier, coinValueMultiplier = 1) {
  score.coins += 1;
  const pts = COIN_SCORE * multiplier * coinValueMultiplier;
  score.bonus += pts;
  return pts;
}
export function addSmash(score, multiplier) {
  score.smashes += 1;
  const pts = SMASH_SCORE * multiplier;
  score.bonus += pts;
  return pts;
}
export function total(score) { return Math.floor(score.distance) + score.bonus; }
