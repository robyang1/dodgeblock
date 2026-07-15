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

  draw(gfx) {
    gfx.fillStyle(COLOR_PLAYER);
    gfx.fillRoundedRect(this.x, this.y, this.w, this.h, this.w / 10);
    gfx.fillStyle(0x000000);

    // face position: 3 vertical states x 3 look directions
    let eyeY, mouthY;
    if (this.yVel > 0.5) {
      eyeY = 0.22;
      mouthY = 0.54;
    } else if (this.yVel < -3.3) {
      eyeY = 0.43;
      mouthY = 0.73;
    } else {
      eyeY = 1 / 3;
      mouthY = 2 / 3;
    }
    let eye1X, eye2X, mouthX;
    if (this.xVel > 0.8) {
      eye1X = 0.3;
      eye2X = 0.75;
      mouthX = 0.4;
    } else if (this.xVel < -0.8) {
      eye1X = 0.1;
      eye2X = 0.55;
      mouthX = 0.2;
    } else {
      eye1X = 0.2;
      eye2X = 0.65;
      mouthX = 0.3;
    }
    gfx.fillRect(this.x + this.w * eye1X, this.y + this.h * eyeY, this.w * 0.15, this.h * 0.15);
    gfx.fillRect(this.x + this.w * eye2X, this.y + this.h * eyeY, this.w * 0.15, this.h * 0.15);
    gfx.fillRect(this.x + this.w * mouthX, this.y + this.h * mouthY, this.w * 0.4, this.h * 0.25);

    if (this.shieldTimer > 0) {
      gfx.lineStyle(this.w / 15, COLOR_SHIELD);
      gfx.strokeEllipse(
        this.x + this.w / 2,
        this.y + this.h / 2,
        this.w * 1.414,
        this.h * 1.414,
      );
    }
  }
}
