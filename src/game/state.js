export const MODES = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };

export function createGame() { return { mode: MODES.MENU }; }

function transition(game, allowedFrom, to) {
  if (!allowedFrom.includes(game.mode)) return false;
  game.mode = to;
  return true;
}

export const start    = (g) => transition(g, [MODES.MENU, MODES.GAMEOVER], MODES.PLAYING);
export const pause    = (g) => transition(g, [MODES.PLAYING], MODES.PAUSED);
export const resume   = (g) => transition(g, [MODES.PAUSED], MODES.PLAYING);
export const gameOver = (g) => transition(g, [MODES.PLAYING], MODES.GAMEOVER);
export const toMenu   = (g) => transition(g, [MODES.PAUSED, MODES.GAMEOVER], MODES.MENU);
