import { POWERUP_SIZE } from '../constants.js';

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
