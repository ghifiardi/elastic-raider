import { VIEW, pxToMeters } from './data/constants.js';
import { createRng } from './engine/rng.js';
import { createLoop } from './engine/loop.js';
import { createInput } from './engine/input.js';
import { createRenderer } from './engine/render.js';
import { createAudio } from './engine/audio.js';
import { createScreens } from './ui/screens.js';
import { MODES, createGame, start, gameOver } from './game/state.js';
import { createPlayer, updatePlayer } from './game/player.js';
import { createWorld, updateWorld } from './game/world.js';
import { runSpeed } from './game/spawner.js';
import { aabb, playerBox, dashBox } from './game/collision.js';
import { createScore, addDistance, addCoin, addSmash, total } from './game/scoring.js';
import { createCombo, registerSmash, tickCombo, multiplier } from './game/combat.js';
import { createStorage } from './meta/storage.js';
import { recordHighScore, load } from './meta/save.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = VIEW.W * dpr; canvas.height = VIEW.H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize(); window.addEventListener('resize', resize);

const storage = createStorage();
const renderer = createRenderer(ctx);
const screens = createScreens(renderer);
const audio = createAudio();
const input = createInput(window);

const game = createGame();
let run = null;
let runCounter = 0;
let highScore = load(storage).highScore;
let lastResult = { score: 0, isNewBest: false };

function newRun() {
  const seed = (Date.now() ^ (runCounter++ * 2654435761)) >>> 0;
  const rng = createRng(seed);
  run = {
    rng,
    player: createPlayer(),
    world: createWorld(rng),
    score: createScore(),
    combo: createCombo(),
    elapsed: 0,
  };
}

function beginPlaying() {
  audio.unlock();
  newRun();
  start(game);
}

function endRun() {
  const finalScore = total(run.score);
  const prevBest = highScore;
  highScore = recordHighScore(storage, finalScore);
  lastResult = { score: finalScore, isNewBest: finalScore > prevBest && finalScore > 0 };
  audio.death();
  gameOver(game);
}

function overGap(p, entities) {
  if (!p.onGround) return false;
  const pb = playerBox(p);
  const footCenter = pb.x + pb.w / 2;
  for (const e of entities) {
    if (e.type !== 'gap') continue;
    if (footCenter > e.x && footCenter < e.x + e.w) return true;
  }
  return false;
}

function update(dt) {
  const actions = input.consume();

  if (game.mode === MODES.MENU || game.mode === MODES.GAMEOVER) {
    if (actions.jumpPressed) beginPlaying();
    return;
  }
  if (game.mode !== MODES.PLAYING) return;

  run.elapsed += dt;
  const speed = runSpeed(run.elapsed);

  updatePlayer(run.player, actions, dt);
  if (actions.jumpPressed) audio.jump();

  updateWorld(run.world, dt, speed);
  addDistance(run.score, pxToMeters(speed * dt));
  tickCombo(run.combo, dt);

  const pb = playerBox(run.player);
  const db = dashBox(run.player);
  for (const e of run.world.entities) {
    if (e.dead || e.collected) continue;
    if (e.type === 'coin') {
      if (aabb(pb, e)) { e.collected = true; addCoin(run.score, multiplier(run.combo)); audio.coin(); }
      continue;
    }
    if (e.type === 'gap') continue;
    if (e.type === 'marine' && db && aabb(db, e)) {
      e.dead = true; registerSmash(run.combo); addSmash(run.score, multiplier(run.combo)); audio.smash();
      continue;
    }
    if (aabb(pb, e)) { endRun(); return; }
  }
  if (overGap(run.player, run.world.entities)) { endRun(); return; }
}

function render() {
  renderer.clear();
  if (game.mode === MODES.MENU) {
    renderer.background(0);
    renderer.ground([]);
    screens.menu();
    return;
  }
  renderer.background(run.world.traveledPx);
  renderer.ground(run.world.entities);
  renderer.entitiesLayer(run.world.entities);
  renderer.player(run.player);
  screens.hud(total(run.score), multiplier(run.combo), highScore);
  if (game.mode === MODES.GAMEOVER) screens.gameOver(lastResult.score, highScore, lastResult.isNewBest);
}

createLoop({ update, render }).start();
