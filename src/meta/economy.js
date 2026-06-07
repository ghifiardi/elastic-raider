// Pure economy helpers operating on the in-memory save object. No window/DOM/Canvas.

export function walletBalance(saveData) { return saveData.coins; }

export function canAfford(saveData, cost) { return saveData.coins >= cost; }

export function spend(saveData, cost) {
  if (saveData.coins < cost) return false;
  saveData.coins -= cost;
  return true;
}

export function earn(saveData, n) { saveData.coins += n; }

// Mission-agnostic snapshot built from the run's SCORE STATE (not total(score)).
// distanceM/coins/smashes derive from scoreState; maxComboCount is passed in.
export function makeRunSummary(scoreState, maxComboCount) {
  return {
    distanceM: Math.floor(scoreState.distance),
    coins: scoreState.coins,
    smashes: scoreState.smashes,
    maxComboCount,
  };
}

// Apply a finished run to the save: bank the raw coin count + accumulate lifetime stats.
export function bankRun(saveData, summary) {
  earn(saveData, summary.coins);
  const s = saveData.stats;
  s.runs += 1;
  s.coinsBankedTotal += summary.coins;
  s.distanceTotalM += summary.distanceM;
  s.smashesTotal += summary.smashes;
  s.bestComboCount = Math.max(s.bestComboCount, summary.maxComboCount);
  return summary.coins;
}
