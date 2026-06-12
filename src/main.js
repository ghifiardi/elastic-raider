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
import {
  createPowerups, activate, tick as tickPowerups, gearActive, isInvincible,
  magnetActive, scoreMultiplier, consumeRevive, speedScale, magnetPull,
} from './game/powerups.js';
import { createStorage } from './meta/storage.js';
import { load, save, updateHighScore } from './meta/save.js';
import { makeRunSummary, bankRun } from './meta/economy.js';
import { effectsOf } from './meta/shop.js';
import { createOverlay } from './ui/overlay.js';
import { createFx, skyPhase } from './engine/fx.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const playfield = document.getElementById('playfield');
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = VIEW.W * dpr;
  canvas.height = VIEW.H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Fit the 16:9 playfield into the viewport without distortion (letterbox).
  const fit = Math.min(window.innerWidth / VIEW.W, window.innerHeight / VIEW.H);
  canvas.style.width = `${VIEW.W * fit}px`;
  canvas.style.height = `${VIEW.H * fit}px`;
  playfield.style.width = canvas.style.width;
  playfield.style.height = canvas.style.height;
}
resize(); window.addEventListener('resize', resize);

const storage = createStorage();
const renderer = createRenderer(ctx);
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const screens = createScreens(renderer, IS_TOUCH);
const audio = createAudio();
const input = createInput(window);

const game = createGame();
const saveData = load(storage);        // full v3 save object, persisted across runs in memory

const shopButton = document.createElement('button');
shopButton.id = 'shop-open';
shopButton.textContent = '\u{1F6D2} SHOP';
playfield.appendChild(shopButton);
const overlay = createOverlay({
  root: document.getElementById('overlay'),
  openButton: shopButton,
  saveData,
  persist: () => save(storage, saveData),
  input,
});

let run = null;
let fx = null;
let runCounter = 0;
let lastResult = { score: 0, isNewBest: false, banked: 0, wallet: saveData.coins };
let clock = 0; // seconds, advanced every frame (drives sprite animation in all modes)

const PICKUPS = new Set(['gear', 'magnet', 'mult', 'revive']);
const PICKUP_COLORS = { gear: '#ff7a33', magnet: '#46c2ff', mult: '#b388ff', revive: '#ff5d8f' };

// Explicit center points for FX events (screen coordinates).
const entityCenter = (e) => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 });
function playerCenter(p) {
  const pb = playerBox(p);
  return { x: pb.x + pb.w / 2, y: pb.y + pb.h / 2 };
}

function newRun() {
  const seed = (Date.now() ^ (runCounter++ * 2654435761)) >>> 0;
  const rng = createRng(seed);
  const effects = effectsOf(saveData);
  fx = createFx(createRng(seed ^ 0x9e3779b9));   // separate stream: fx draws must not perturb spawning
  run = {
    rng,
    effects,
    player: createPlayer(),
    world: createWorld(rng),
    score: createScore(),
    combo: createCombo(),
    powerups: createPowerups(effects),
    elapsed: 0,
    maxComboCount: 0,
    pendingDeath: false,
  };
}

function beginPlaying() {
  audio.unlock();
  newRun();
  start(game);
}

function endRun() {
  const finalScore = total(run.score);
  const summary = makeRunSummary(run.score, run.maxComboCount);
  const banked = bankRun(saveData, summary);
  const isNewBest = updateHighScore(saveData, finalScore);
  save(storage, saveData);
  lastResult = { score: finalScore, isNewBest, banked, wallet: saveData.coins };
  audio.death();
  gameOver(game);
}

// A fatal hit either burns a Revive (survival, no points) or sets a PENDING
// death: the death burst + hit-stop play first; endRun() (banking, audio,
// game-over transition) fires only after the freeze expires (see update()).
function fatal() {
  const pc = playerCenter(run.player);
  if (consumeRevive(run.powerups)) { audio.revive(); fx.reviveFlash(pc.x, pc.y); return; }
  fx.deathBurst(pc.x, pc.y);                      // also starts shake + freeze
  run.pendingDeath = true;
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
  clock += dt;
  const actions = input.consume();
  overlay.setButtonVisible(game.mode === MODES.MENU || game.mode === MODES.GAMEOVER);
  if (overlay.isOpen()) return;        // snapshot already consumed and discarded

  if (run) fx.update(dt);                          // fx animates in PLAYING and GAMEOVER

  if (game.mode === MODES.MENU || game.mode === MODES.GAMEOVER) {
    if (actions.jumpPressed) beginPlaying();
    return;
  }
  if (game.mode !== MODES.PLAYING) return;
  if (fx.frozen()) return;                         // hit-stop: input consumed, fx ticked, sim skipped
  if (run.pendingDeath) { run.pendingDeath = false; endRun(); return; }

  run.elapsed += dt;
  tickPowerups(run.powerups, dt);
  const speed = runSpeed(run.elapsed) * speedScale(run.powerups);

  updatePlayer(run.player, actions, dt, run.effects.dashCooldown);
  if (actions.jumpPressed) audio.jump();

  updateWorld(run.world, dt, speed);
  addDistance(run.score, pxToMeters(speed * dt));
  tickCombo(run.combo, dt);

  const pb = playerBox(run.player);
  const db = dashBox(run.player);
  if (magnetActive(run.powerups)) magnetPull(run.world.entities, pb, dt);

  for (const e of run.world.entities) {
    if (e.dead || e.collected) continue;
    if (e.type === 'coin') {
      if (aabb(pb, e)) {
        e.collected = true;
        const pts = addCoin(run.score, multiplier(run.combo) * scoreMultiplier(run.powerups), run.effects.coinValueMultiplier);
        const c = entityCenter(e);
        fx.coinBurst(c.x, c.y);
        fx.popup(c.x, c.y - 18, `+${Math.round(pts)}`, '#ffcf3f');
        audio.coin();
      }
      continue;
    }
    if (PICKUPS.has(e.type)) {
      if (aabb(pb, e)) {
        e.collected = true; activate(run.powerups, e.type); audio.powerup();
        const c = entityCenter(e);
        fx.powerupRing(c.x, c.y, PICKUP_COLORS[e.type]);
      }
      continue;
    }
    if (e.type === 'gap') continue;
    // Marine smashed by dash OR by Gear. registerSmash before reading multiplier
    // (intentional: the tier-reaching smash scores at the new multiplier).
    if (e.type === 'marine' && ((db && aabb(db, e)) || (gearActive(run.powerups) && aabb(pb, e)))) {
      e.dead = true;
      const tierBefore = multiplier(run.combo);
      registerSmash(run.combo);
      run.maxComboCount = Math.max(run.maxComboCount, run.combo.count);
      const pts = addSmash(run.score, multiplier(run.combo) * scoreMultiplier(run.powerups));
      const c = entityCenter(e);
      fx.smashBurst(c.x, c.y);
      fx.popup(c.x, c.y - 24, `+${Math.round(pts)}`, '#ff7a33');
      if (multiplier(run.combo) > tierBefore) fx.comboFlash('#b388ff');  // tier crossing only
      audio.smash();
      continue;
    }
    // Unsmashed marine or any crate: phased while invincible, otherwise fatal.
    if (aabb(pb, e)) {
      if (isInvincible(run.powerups)) continue;
      fatal();
      return;
    }
  }
  if (overGap(run.player, run.world.entities) && !isInvincible(run.powerups)) { fatal(); return; }
}

function render() {
  renderer.clear();
  if (game.mode === MODES.MENU) {
    renderer.background(0, clock);                 // menu stays day (phase 0)
    renderer.ground([], clock);
    screens.menu(saveData.coins);
    return;
  }
  const phase = skyPhase(pxToMeters(run.world.traveledPx));
  renderer.beginShake(fx.offset());                // --- shaken, world-aligned pass
  renderer.background(run.world.traveledPx, clock, phase);
  renderer.ground(run.world.entities, clock);
  renderer.entitiesLayer(run.world.entities, clock);
  if (magnetActive(run.powerups)) renderer.magnetRing(playerBox(run.player));
  renderer.player(run.player, isInvincible(run.powerups), clock);
  renderer.fxLayer(fx.state());
  renderer.endShake();                             // --- end shaken pass
  renderer.flashLayer(fx.state().flash);           // unshaken full-screen flash
  screens.hud(total(run.score), multiplier(run.combo), saveData.highScore, {   // unshaken HUD
    revives: run.powerups.revives,
    scoreMult: scoreMultiplier(run.powerups),
  });
  if (game.mode === MODES.GAMEOVER) {
    screens.gameOver(lastResult.score, saveData.highScore, lastResult.isNewBest, lastResult.banked, lastResult.wallet);
  }
}

createLoop({ update, render }).start();
