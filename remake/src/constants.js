// All tuned values come from classic/script.js — do not change without
// checking against the original, gameplay feel depends on exact numbers.

// Fixed-timestep simulation (the original assumed 60fps)
export const STEP_MS = 1000 / 60;
export const MAX_STEPS_PER_FRAME = 5;

export const GAME_W = 800;
export const GAME_H = 500;

// Canvas resolution multiplier. The game logic lives in 800x500 coordinates,
// but the canvas is RES times bigger (with cameras zoomed to match) so it
// stays crisp on large / high-DPI screens instead of upscaling 800x500 pixels.
export const RES =
  typeof window !== 'undefined'
    ? Math.min(
        4,
        Math.max(
          1,
          Math.ceil((window.screen.width * (window.devicePixelRatio || 1)) / GAME_W),
        ),
      )
    : 1;

// Physics (per sim step)
export const GRAVITY = 0.3;
export const JUMP_VEL = 8;
export const JUMP_VEL_BOOSTED = 9; // with vSpeed powerup
export const X_DAMPING = 0.8;
export const HMOV = 1.15;
export const HMOV_BOOSTED = 1.8; // with hSpeed powerup
export const DOWN_BOOST = 0.6; // holding down with vSpeed powerup

export const PLAYER_SIZE = 30;
export const PLAYER_START_X = 385;
export const PLAYER_START_Y = 270;
export const PLAYER_MIN_X = -100;
export const PLAYER_MAX_X = 900; // constrained to [MIN_X, MAX_X - w]

export const BLOCK_W = 60;
export const BLOCK_H = 40;
export const SPAWN_MIN_X = -100;
export const SPAWN_MAX_X = 840;

export const GROUND = { x: -100, y: 300, w: 1000, h: 900 };

// The original only updates/draws the last 200 blocks and collides the
// player against the last 300 — kept faithfully.
export const BLOCK_UPDATE_WINDOW = 200;
export const BLOCK_COLLIDE_WINDOW = 300;

// A block falling faster than this squishes (kills) the player
export const SQUISH_VEL = 3;

export const POWERUP_SIZE = 20;
export const POWERUP_LIFETIME = 300; // frames before despawn
export const POWERUP_FLASH_AT = 240; // world pickup blinks past this age
export const HUD_FLASH_AT = 120; // HUD icon blinks below this much time left
export const POWERUP_TIMER_ADD = 600;
export const VSPEED_TIMER_ADD = 1000;
export const POWERUP_TIMER_CAP = 99999;
export const POWERUP_CYCLE = 35; // pwrCounter % 35 → spawn schedule

// Faithful-bug toggle: the original `break`s out of the whole falling-block
// loop when a block lands at ground level (classic/script.js:504), stalling
// every other falling block for a frame. Off = fixed.
export const FAITHFUL_GROUND_BREAK = false;

// Colors — sky
export const COLOR_SKY_TOP = 0x6ec0f2;
export const COLOR_SKY_BOTTOM = 0xd8f0ff;
export const COLOR_DEAD_SKY_TOP = 0x42556e;
export const COLOR_DEAD_SKY_BOTTOM = 0x7d90a8;
export const COLOR_BG_GAME = 0xb0e8ff; // camera fallback behind the gradient

// blocks
export const COLOR_BLOCK_FILLS = [0xd9a066, 0xd2985c, 0xe0aa70]; // subtle variation
export const COLOR_BLOCK_BORDER = 0x6e4a2a;
export const COLOR_BLOCK_TOP = 0xf2cf96; // bevel highlight
export const COLOR_BLOCK_SHADE = 0x8a5f33; // bevel shadow
export const COLOR_WARNING = 0xff3b30;

// ground
export const COLOR_GRASS = 0x5db33f;
export const COLOR_GRASS_DARK = 0x468a2e;
export const COLOR_SOIL_TOP = 0x7a5230;
export const COLOR_SOIL_BOTTOM = 0x462d17;

// player
export const COLOR_PLAYER = 0xe8433f;
export const COLOR_PLAYER_BORDER = 0xa32b28;
export const COLOR_PLAYER_MOUTH = 0x5c1f1d;
export const COLOR_SHIELD = 0x2ee6a8;

// powerup badge colors, keyed by type
export const POWERUP_COLORS = {
  I: 0x2ee6a8, // shield — green
  H: 0xff9f1c, // horizontal speed — orange
  D: 0x9b5de5, // double jump — purple
  V: 0x00bbf9, // vertical boost — blue
  S: 0xffd700, // coin — gold
};
export const COLOR_COIN_STROKE = 0xb8860b;

export const FONT = "'Trebuchet MS', Verdana, Arial, sans-serif";
