import { VIEW } from '../data/constants.js';

export function createScreens(renderer) {
  function menu() {
    renderer.text('ELASTIC RAIDER', VIEW.W / 2, VIEW.H / 2 - 40, 48, 'center');
    renderer.text('Tap / Space to start', VIEW.W / 2, VIEW.H / 2 + 10, 22, 'center');
    renderer.text('↑/Space jump · ↓ slide · X/→ dash-smash', VIEW.W / 2, VIEW.H / 2 + 44, 18, 'center');
  }

  // info = { revives, scoreMult }
  function hud(score, combo, highScore, info = { revives: 0, scoreMult: 1 }) {
    renderer.text(`Score ${score}`, 16, 32, 22, 'left');
    renderer.text(`Best ${highScore}`, 16, 58, 16, 'left');
    if (info.revives > 0) renderer.text(`Revive x${info.revives}`, 16, 82, 16, 'left');
    let rightY = 32;
    if (combo >= 2) { renderer.text(`x${combo} COMBO`, VIEW.W - 16, rightY, 22, 'right'); rightY += 28; }
    if (info.scoreMult > 1) renderer.text(`x${info.scoreMult} SCORE`, VIEW.W - 16, rightY, 20, 'right');
  }

  function gameOver(score, highScore, isNewBest) {
    renderer.text('WRECKED', VIEW.W / 2, VIEW.H / 2 - 50, 44, 'center');
    renderer.text(`Score ${score}`, VIEW.W / 2, VIEW.H / 2, 26, 'center');
    renderer.text(isNewBest ? 'NEW BEST!' : `Best ${highScore}`, VIEW.W / 2, VIEW.H / 2 + 34, 20, 'center');
    renderer.text('Tap / Space to run again', VIEW.W / 2, VIEW.H / 2 + 74, 20, 'center');
  }

  return { menu, hud, gameOver };
}
