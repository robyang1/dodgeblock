import {
  POWERUP_SIZE,
  POWERUP_COLORS,
  COLOR_COIN_STROKE,
} from './constants.js';

// Types keep the original's single-letter tags:
// I = shield, H = horizontal speed, D = double jump, V = vertical speed, S = coin
export class Powerup {
  constructor(type, x, y) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.w = POWERUP_SIZE;
    this.h = POWERUP_SIZE;
    this.yVel = 0;
    this.timer = 0;
    this.visible = true; // flash state, decided in the sim step
  }
}

// Icon text drawn on top of badge powerups (Graphics can't render text; the
// scene keeps a Text pool for these). Sizes fit a 20px badge.
export const POWERUP_LABEL = {
  H: { text: '↔', size: 13 },
  D: { text: '↑↑', size: 10 },
  V: { text: '↕', size: 13 },
};

// Short name floated above the player on pickup
export const POWERUP_PICKUP_TEXT = {
  I: 'Shield!',
  H: 'Speed!',
  D: 'Double jump!',
  V: 'Boost!',
  S: '+200',
};

export function drawPowerup(gfx, pw) {
  const color = POWERUP_COLORS[pw.type];
  const cx = pw.x + pw.w / 2;
  const cy = pw.y + pw.h / 2;
  switch (pw.type) {
    case 'S': // coin: gold disc, darker rim, small shine arc
      gfx.lineStyle(2, COLOR_COIN_STROKE);
      gfx.fillStyle(color);
      gfx.fillEllipse(cx, cy, pw.w, pw.h);
      gfx.strokeEllipse(cx, cy, pw.w, pw.h);
      gfx.lineStyle(1.5, COLOR_COIN_STROKE, 0.6);
      gfx.strokeEllipse(cx, cy, pw.w * 0.6, pw.h * 0.6);
      gfx.fillStyle(0xffffff, 0.7);
      gfx.fillEllipse(cx - pw.w * 0.2, cy - pw.h * 0.22, pw.w * 0.18, pw.h * 0.12);
      break;
    case 'I': // shield: badge with a white ring
      drawBadge(gfx, pw, color);
      gfx.lineStyle(2, 0xffffff, 0.95);
      gfx.strokeEllipse(cx, cy, pw.w * 0.55, pw.h * 0.55);
      break;
    default: // H / D / V: badge; icon text comes from the scene's Text pool
      drawBadge(gfx, pw, color);
      break;
  }
}

function drawBadge(gfx, pw, color) {
  const r = pw.w / 4;
  gfx.fillStyle(0x000000, 0.18); // soft drop shadow
  gfx.fillRoundedRect(pw.x + 1.5, pw.y + 2.5, pw.w, pw.h, r);
  gfx.lineStyle(2, 0xffffff, 0.9);
  gfx.fillStyle(color);
  gfx.fillRoundedRect(pw.x, pw.y, pw.w, pw.h, r);
  gfx.strokeRoundedRect(pw.x, pw.y, pw.w, pw.h, r);
}
