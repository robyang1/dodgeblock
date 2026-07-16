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
// Remaster: block spawn x snaps to a quarter-block grid, and stacking
// requires strict x-overlap — so blocks always overlap their support by at
// least SPAWN_GRID px and never balance on a rounded corner. (The original
// spawned at any integer x and stacked on inclusive-edge contact, allowing
// 0px-overlap "floating" catches.)
export const SPAWN_GRID = BLOCK_W / 4; // 15

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

// Remaster: the original spawned a block when `frame % round(12e6/(350*frame
// + 1e5)) === 0`. That formula is a quantized version of a LINEAR rate:
// 60/fpb = (350*frame + 1e5)/2e5 = 0.5 + 0.00175*frame blocks per second.
// We accumulate that rate directly — no integer fpb, so no 50% rate cliffs
// when fpb steps 3->2->1, and no fpb=0 insta-death at ~19 minutes. Verified
// against the exact original schedule: within ~10% at every checkpoint.
export const BLOCK_RATE_BASE = 0.5; // blocks/sec at frame 0
export const BLOCK_RATE_GROWTH = 0.00175; // blocks/sec gained per sim frame

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

// ============================== REMIX =====================================
// Everything below is new in the remix. Frame counts are 60Hz sim frames.

// Input forgiveness
export const JUMP_BUFFER_FRAMES = 6; // a tap this early still fires on landing
export const DASH_BUFFER_FRAMES = 4;

// Spark Dash
export const DASH_FRAMES = 11; // airborne phase-through duration
export const DASH_SPEED = 9; // px per frame, horizontal
export const DASH_EXIT_XVEL = 4; // carry-over momentum
export const DASH_RECOVERY_IFRAMES = 4; // squish immunity after the dash ends
export const DASH_COOLDOWN = 10;
export const SPARK_CAP = 2; // 3 at Heat tier 2
export const SPARK_CAP_T2 = 3;

// Graze
export const GRAZE_PAD = 16; // px the block AABB is inflated by
export const GRAZE_PERFECT_GAP = 5; // gap <= this at any frame = perfect
export const GRAZE_LETHAL_VEL = 6; // only blocks falling this fast pay out
export const GRAZE_COLUMN_COOLDOWN = 45; // frames; same-column grazes pay 0

// Spike Drop
export const SPIKE_WINDUP = 4; // hang frames before the plunge
export const SPIKE_VEL = 14; // downward px/frame during the drop
export const SPIKE_BOUNCE_VEL = 7; // upward bounce off a fixed block

// Storm surfing / Crest Jump
export const SURF_MIN_VEL = 3; // standing on a block falling faster = surfing
export const SURF_HEAT_EVERY = 30; // +1 Heat per this many frames ridden
export const SURF_SPARK_EVERY = 60;
export const CREST_MIN_RIDE = 6; // frames ridden before the landing counts
export const CREST_WINDOW = 10; // frames after landing to fire the crest jump
export const CREST_JUMP_VEL = 11; // ~5 layers vs the normal ~2.7
export const CREST_SLOWMO_SCALE = 0.6;
export const CREST_SLOWMO_FRAMES = 10;
export const CREST_SLOWMO_COOLDOWN = 180;

// Heat — flow meter: buffs + score multiplier + music intensity
export const HEAT_MAX = 8;
export const HEAT_DECAY_FRAMES = 240; // -1 pip per this many frames idle
export const HEAT_T1 = 3; // walk accel up, x2 score
export const HEAT_T2 = 6; // spark cap 3, jump 8.6, x3 score
export const HEAT_T3 = 8; // x4 score
export const HMOV_T1 = 1.35;
export const JUMP_VEL_T2 = 8.6;
export const FRESH_FOOTING_FRAMES = 45; // standing on a block this new pays Heat

// Gilded blocks — a moving jackpot, exactly as lethal as any other block.
// Pays only via the risk verbs (graze / dash-phase / spike-shatter).
export const GILDED_CHANCE = 0.05; // ~1 in 20 spawns
export const GILDED_GLOW_FRAMES = 90; // shatter window after landing
export const COLOR_GILDED = 0xffd700;

// Difficulty (remix): gentler base growth than the remake's 0.00175 — the
// director's surges make up the difference with TEXTURE instead of a
// monotone ramp.
export const RATE_GROWTH_REMIX = 0.0012;

// Director phases (frames; durations rolled per-cycle from the seeded rng)
export const DIRECTOR_FLAT_FRAMES = 1200; // first 20s play like classic
export const CALM_MUL = 0.55;
export const SURGE_MUL = 1.3;
export const CALM_FRAMES = [480, 720]; // 8-12s
export const BUILD_FRAMES = [480, 600]; // 8-10s
export const SURGE_FRAMES = [360, 600]; // 6-10s
export const RELEASE_FRAMES = 180; // 3s

// Scoring: altitude gain accrues x heatMult; the coin powerup pays per-mult
export const COIN_VALUE = 25;

// Crumble clouds (Cloudtop zone): semisolid bonus footing
export const CLOUD_PLAT_W = 90;
export const CLOUD_PLAT_H = 20;
export const CLOUD_PLAT_EVERY = 360; // spawn cadence in frames (~6s)
export const CLOUD_PLAT_SPEED = 0.6; // horizontal drift px/frame
export const CLOUD_PLAT_CRUMBLE = 60; // frames after first stood on

// Drift blocks (Aurora zone): sinusoid-ish wobble while falling
export const DRIFT_AMP = 30; // +/- px
export const DRIFT_PERIOD = 120; // frames (triangle wave — no Math.sin in sim)
