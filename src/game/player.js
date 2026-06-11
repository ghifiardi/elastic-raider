import {
  GROUND_Y, PLAYER, GRAVITY, JUMP_VELOCITY, JUMP_CUT,
  SLIDE_DURATION, DASH_DURATION, DASH_COOLDOWN,
} from '../data/constants.js';

export function createPlayer() {
  return {
    x: PLAYER.x, y: GROUND_Y, vy: 0,
    state: 'running', onGround: true, height: PLAYER.hStand,
    slideTimer: 0, dashTimer: 0, dashCooldown: 0, alive: true,
  };
}

export function updatePlayer(player, actions, dt, dashCooldown = DASH_COOLDOWN) {
  // Timers
  if (player.dashCooldown > 0) player.dashCooldown = Math.max(0, player.dashCooldown - dt);

  // Dash (independent of ground; cannot start while already dashing or on cooldown)
  if (actions.dashPressed && player.state !== 'dashing' && player.dashCooldown <= 0) {
    player.state = 'dashing';
    player.dashTimer = DASH_DURATION;
    player.dashCooldown = dashCooldown;
  }
  if (player.state === 'dashing') {
    player.dashTimer -= dt;
    if (player.dashTimer <= 0) player.state = player.onGround ? 'running' : 'jumping';
  }

  // Slide (only from the ground; not while dashing)
  if (actions.slidePressed && player.onGround && player.state !== 'dashing') {
    player.state = 'sliding';
    player.slideTimer = SLIDE_DURATION;
  }
  if (player.state === 'sliding') {
    player.slideTimer -= dt;
    if (player.slideTimer <= 0) player.state = 'running';
  }

  // Jump (only from the ground; not while sliding/dashing)
  if (actions.jumpPressed && player.onGround &&
      player.state !== 'sliding' && player.state !== 'dashing') {
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
    player.state = 'jumping';
  }
  // Variable jump height: while rising with jump released, drain upward velocity
  // each frame (exponential decay) for a snappy short-hop.
  if (!actions.jumpHeld && player.vy < 0) player.vy *= JUMP_CUT;

  // Gravity + vertical integration
  if (!player.onGround) {
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y >= GROUND_Y) {
      player.y = GROUND_Y; player.vy = 0; player.onGround = true;
      if (player.state === 'jumping') player.state = 'running';
    }
  }

  // Collision height derives from state.
  player.height = player.state === 'sliding' ? PLAYER.hSlide : PLAYER.hStand;
}
