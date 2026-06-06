// Fixed-timestep loop with a render callback. Pauses on tab/app background
// so the simulation never fast-forwards after returning.
const STEP = 1 / 60;           // fixed simulation step (s)
const MAX_FRAME = 0.25;        // clamp huge gaps (e.g. after a stall)

export function createLoop({ update, render }) {
  let last = 0, acc = 0, running = false, rafId = 0;

  function frame(now) {
    if (!running) return;
    const t = now / 1000;
    let delta = last ? t - last : 0;
    last = t;
    if (delta > MAX_FRAME) delta = MAX_FRAME;
    acc += delta;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    render(acc / STEP); // interpolation alpha (render may ignore it)
    rafId = requestAnimationFrame(frame);
  }

  function start() { if (running) return; running = true; last = 0; rafId = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(rafId); }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stop();
    else start();
  });

  return { start, stop, isRunning: () => running };
}
