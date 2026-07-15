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

// Colors
export const COLOR_BG_GAME = 0xb0e8ff; // rgb(176,232,255)
export const COLOR_BG_MENU = 0xd7ecfa; // rgb(215,236,250)
export const COLOR_BG_DEAD = 0xdcdcdc; // gray 220
export const COLOR_BLOCK_FILL = 0xdeb887; // rgb(222,184,135)
export const COLOR_STROKE_GRAY = 0x323232; // gray 50
export const COLOR_PLAYER = 0xff0000;
export const COLOR_SHIELD = 0x1bd182; // rgb(27,209,130)
export const COLOR_POWERUP_FILL = 0xa3d11b; // rgb(163,209,27)
export const COLOR_COIN_FILL = 0xffd700; // rgb(255,215,0)
export const COLOR_COIN_STROKE = 0xba9f00; // rgb(186,159,0)

export const FONT = 'Arial, Helvetica, sans-serif';
