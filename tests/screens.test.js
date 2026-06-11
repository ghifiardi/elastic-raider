import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreens } from '../src/ui/screens.js';

function captureRenderer() {
  const texts = [];
  return { texts, text: (s) => texts.push(String(s)) };
}

test('menu shows gesture hints on touch devices', () => {
  const r = captureRenderer();
  createScreens(r, true).menu(0);
  assert.ok(r.texts.some((t) => t.includes('tap jump · swipe ↓ slide · swipe → dash-smash')));
  assert.ok(!r.texts.some((t) => t.includes('Space jump')));
});

test('menu keeps keyboard hints on desktop', () => {
  const r = captureRenderer();
  createScreens(r, false).menu(0);
  assert.ok(r.texts.some((t) => t.includes('↑/Space jump')));
});
