import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, createGame, start, pause, resume, gameOver, toMenu } from '../src/game/state.js';

test('game begins in MENU', () => {
  assert.equal(createGame().mode, MODES.MENU);
});

test('start: menu -> playing', () => {
  const g = createGame();
  assert.equal(start(g), true);
  assert.equal(g.mode, MODES.PLAYING);
});

test('pause/resume only valid while playing/paused', () => {
  const g = createGame();
  assert.equal(pause(g), false);
  start(g);
  assert.equal(pause(g), true);
  assert.equal(g.mode, MODES.PAUSED);
  assert.equal(resume(g), true);
  assert.equal(g.mode, MODES.PLAYING);
});

test('gameOver: playing -> gameover, and start restarts', () => {
  const g = createGame(); start(g);
  assert.equal(gameOver(g), true);
  assert.equal(g.mode, MODES.GAMEOVER);
  assert.equal(start(g), true);
  assert.equal(g.mode, MODES.PLAYING);
});

test('invalid transitions are no-ops returning false', () => {
  const g = createGame();
  assert.equal(resume(g), false);
  assert.equal(gameOver(g), false);
  assert.equal(toMenu(g), false);
});
