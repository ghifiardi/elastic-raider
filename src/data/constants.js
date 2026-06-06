// Logical render units (canvas is scaled to fit the viewport at draw time).
export const VIEW = { W: 960, H: 540 };
export const GROUND_Y = 460;        // y of the ground surface (top of ground)

// Physics (units: pixels, seconds)
export const GRAVITY = 2400;
export const JUMP_VELOCITY = -900;
export const JUMP_CUT = 0.45;       // velocity kept when jump released while rising

// Run speed curve (px/s of world scroll)
export const RUN_SPEED_START = 320;
export const RUN_SPEED_MAX = 820;
export const RUN_SPEED_RAMP = 6;    // px/s added per second survived (gentler early ramp)
// Hazard-free opening so the first seconds are fair (meters of cumulative travel).
export const SAFE_RUNWAY_M = 18;

// Player
export const PLAYER = { x: 180, w: 48, hStand: 64, hSlide: 32 };
export const SLIDE_DURATION = 0.5;
export const DASH_DURATION = 0.18;
export const DASH_REACH = 56;       // forward extent of dash hitbox
export const DASH_COOLDOWN = 0.35;

// Scoring / combo
export const PPM = 50;              // pixels per meter
export const COIN_SCORE = 10;
export const SMASH_SCORE = 50;
export const COMBO_WINDOW = 1.5;    // seconds a combo stays alive
export const COMBO_MAX_MULT = 5;

export function pxToMeters(px) { return px / PPM; }

// Power-ups
export const GEAR_DURATION = 5;        // s of invincibility + marine auto-smash
export const MAGNET_DURATION = 6;      // s of coin attraction
export const MULTIPLIER_DURATION = 8;  // s of score multiplier
export const MERCY_DURATION = 1.5;     // s of post-revive invincibility
export const MULTIPLIER_VALUE = 2;     // score-multiplier power-up factor
export const MAGNET_RADIUS = 220;      // px coins are pulled within
export const MAGNET_PULL_SPEED = 620;  // px/s coins move toward the player
export const REVIVE_SPEED_EASE = 0.4;  // run speed eases to this fraction right after a revive

// Power-up spawn cadence (world px between pickups) — roughly 1 per 8–12s
export const POWERUP_FIRST_OFFSET = 1400;
export const POWERUP_GAP_PX = 3600;
export const POWERUP_GAP_JITTER = 2000;
