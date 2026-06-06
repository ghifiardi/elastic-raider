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
