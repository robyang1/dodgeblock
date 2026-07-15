import {
  GRAVITY,
  JUMP_VEL,
  JUMP_VEL_BOOSTED,
  X_DAMPING,
  HMOV,
  PLAYER_SIZE,
  PLAYER_START_X,
  PLAYER_START_Y,
  PLAYER_MIN_X,
  PLAYER_MAX_X,
  COLOR_PLAYER,
  COLOR_PLAYER_BORDER,
  COLOR_PLAYER_MOUTH,
  COLOR_SHIELD,
} from './constants.js';
import { constrain } from './utils.js';

export class Player {
  constructor() {
    this.x = PLAYER_START_X;
    this.y = PLAYER_START_Y;
    this.w = PLAYER_SIZE;
    this.h = PLAYER_SIZE;
    this.xVel = 0;
    this.yVel = 0;
    this.hMov = HMOV;
    this.shieldTimer = 0;
    this.hTimer = -999990;
    this.vTimer = -99990;
    this.dTimer = -99990;
    // coyote-time / double-jump state (globals in the original)
    this.offGround = 10;
    this.timeSinceJump = 0;
    this.jumps = 0;
    // x before the last updateX(), used to undo walking into a block
    this.originalPos = this.x;
    // cosmetic only: landing squash countdown, set by the scene
    this.landSquash = 0;
  }

  // jKeyLetGo === 1 means the jump key was pressed this very step
  // (edge detection — double jumps require a fresh key press)
  jump(jKeyLetGo) {
    if (
      (this.offGround < 3 && this.timeSinceJump > 2) ||
      (this.dTimer > 0 && this.jumps < 2 && jKeyLetGo === 1)
    ) {
      this.yVel = this.vTimer > 0 ? JUMP_VEL_BOOSTED : JUMP_VEL;
      this.timeSinceJump = 0;
      this.jumps++;
    }
  }

  walk(dir) {
    this.xVel += dir;
  }

  updateX() {
    this.originalPos = this.x;
    this.xVel *= X_DAMPING;
    this.x += this.xVel;
    this.x = constrain(this.x, PLAYER_MIN_X, PLAYER_MAX_X - this.w);
  }

  updateY(upHeld) {
    // variable-height jump: full gravity while rising slowly or holding jump,
    // double gravity otherwise (classic/script.js:167)
    if (this.yVel < 4 || upHeld) {
      this.yVel -= GRAVITY;
    } else {
      this.yVel -= GRAVITY * 2;
    }
    // positive yVel is upward in the original, so y decreases
    this.y -= this.yVel;
  }

  draw(gfx, tick) {
    // squash & stretch (render-only; collisions use the true 30x30 box):
    // stretch tall while moving fast vertically, squash flat just after landing
    let stretch;
    if (this.landSquash > 0) {
      stretch = -0.16 * (this.landSquash / 8);
    } else if (this.offGround > 2) {
      stretch = Math.min(Math.abs(this.yVel) * 0.016, 0.2);
    } else {
      stretch = 0;
    }
    const w = this.w * (1 - stretch);
    const h = this.h * (1 + stretch);
    const x = this.x - (w - this.w) / 2; // keep centered horizontally
    const y = this.y + (this.h - h); // keep feet anchored

    gfx.lineStyle(2, COLOR_PLAYER_BORDER);
    gfx.fillStyle(COLOR_PLAYER);
    gfx.fillRoundedRect(x, y, w, h, w / 6);
    gfx.strokeRoundedRect(x, y, w, h, w / 6);

    // face: 3 vertical states x 3 look directions (original costume grid)
    let eyeY, mouthY, mouthH, pupilDy;
    if (this.yVel > 0.5) {
      eyeY = 0.26;
      mouthY = 0.56;
      mouthH = 0.28; // surprised, mid-jump
      pupilDy = -1;
    } else if (this.yVel < -3.3) {
      eyeY = 0.44;
      mouthY = 0.74;
      mouthH = 0.24; // worried, falling fast
      pupilDy = 1;
    } else {
      eyeY = 0.36;
      mouthY = 0.66;
      mouthH = 0.15;
      pupilDy = 0;
    }
    let eye1X, eye2X, mouthX, pupilDx;
    if (this.xVel > 0.8) {
      eye1X = 0.34;
      eye2X = 0.76;
      mouthX = 0.42;
      pupilDx = 1;
    } else if (this.xVel < -0.8) {
      eye1X = 0.24;
      eye2X = 0.66;
      mouthX = 0.26;
      pupilDx = -1;
    } else {
      eye1X = 0.29;
      eye2X = 0.71;
      mouthX = 0.34;
      pupilDx = 0;
    }

    const eyeR = w * 0.125;
    for (const ex of [eye1X, eye2X]) {
      const cx = x + w * ex;
      const cy = y + h * eyeY;
      gfx.fillStyle(0xffffff);
      gfx.fillCircle(cx, cy, eyeR);
      gfx.fillStyle(0x1c1c1c);
      gfx.fillCircle(cx + pupilDx * eyeR * 0.35, cy + pupilDy * eyeR * 0.3, eyeR * 0.5);
    }
    gfx.fillStyle(COLOR_PLAYER_MOUTH);
    gfx.fillRoundedRect(x + w * mouthX, y + h * mouthY, w * 0.32, h * mouthH, 3);

    if (this.shieldTimer > 0) {
      const cx = this.x + this.w / 2;
      const cy = this.y + this.h / 2;
      const r = 1.414 + 0.06 * Math.sin(tick * 0.2); // gentle pulse
      gfx.lineStyle(6, COLOR_SHIELD, 0.22);
      gfx.strokeEllipse(cx, cy, this.w * r * 1.15, this.h * r * 1.15);
      gfx.lineStyle(2.5, COLOR_SHIELD, 0.95);
      gfx.strokeEllipse(cx, cy, this.w * r, this.h * r);
    }
  }
}
