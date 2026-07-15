import {
  POWERUP_SIZE,
  COLOR_SHIELD,
  COLOR_POWERUP_FILL,
  COLOR_COIN_FILL,
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

// Text drawn on top of each powerup (Graphics can't render text; the scene
// keeps a Text pool for these). Sizes are the original's textSize values
// for a 20px powerup.
export const POWERUP_LABEL = {
  H: { text: '<->', size: 10 },
  D: { text: '↑↑', size: 10 },
  V: { text: '↕', size: 20 },
  S: { text: '+200', size: 20 / 3 },
};

export function drawPowerup(gfx, pw) {
  switch (pw.type) {
    case 'I':
      gfx.lineStyle(2, COLOR_SHIELD);
      gfx.strokeEllipse(pw.x + pw.w / 2, pw.y + pw.h / 2, pw.w, pw.h);
      break;
    case 'H':
    case 'D':
    case 'V':
      gfx.lineStyle(pw.w / 10, 0x000000);
      gfx.fillStyle(COLOR_POWERUP_FILL);
      gfx.fillRect(pw.x, pw.y, pw.w, pw.h);
      gfx.strokeRect(pw.x, pw.y, pw.w, pw.h);
      break;
    case 'S':
      gfx.lineStyle(pw.w / 10, COLOR_COIN_STROKE);
      gfx.fillStyle(COLOR_COIN_FILL);
      gfx.fillEllipse(pw.x + pw.w / 2, pw.y + pw.h / 2, pw.w, pw.h);
      gfx.strokeEllipse(pw.x + pw.w / 2, pw.y + pw.h / 2, pw.w, pw.h);
      break;
  }
}
