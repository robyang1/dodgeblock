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
  SPARK_CAP,
} from '../constants.js';
import { constrain } from './util.js';

export class Player {
  constructor() {
    this.x = PLAYER_START_X;
    this.y = PLAYER_START_Y;
    this.w = PLAYER_SIZE;
    this.h = PLAYER_SIZE;
    this.xVel = 0;
    this.yVel = 0;
    this.facing = 1; // last walked direction; default dash direction
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
    // cosmetic only: landing squash countdown (decremented in the sim so
    // hitstop freezes it along with everything else)
    this.landSquash = 0;

    // --- remix: Spark/Heat economy + verb state ---
    this.sparks = 1; // dash/spike ammo; earned by grazing
    this.sparkCap = SPARK_CAP;
    this.heat = 0; // flow meter, 0..HEAT_MAX
    this.heatIdle = 0; // frames since the last Heat gain
    this.jumpVelBase = JUMP_VEL; // raised at Heat tier 2
    this.dashTimer = 0; // frames of dash remaining
    this.dashDir = 1;
    this.dashCooldown = 0;
    this.dashRecovery = 0; // squish i-frames after a dash/spike ends
    this.dashPhaseCount = 0; // lethal blocks phased this dash (max 2 pay)
    this.spiking = false;
    this.spikeWindup = 0;
    this.spikeShattered = false;
  }

  // jKeyLetGo === 1 means the jump key was pressed this very step
  // (edge detection — double jumps require a fresh key press)
  jump(jKeyLetGo) {
    if (
      (this.offGround < 3 && this.timeSinceJump > 2) ||
      (this.dTimer > 0 && this.jumps < 2 && jKeyLetGo === 1)
    ) {
      this.yVel = this.vTimer > 0 ? JUMP_VEL_BOOSTED : this.jumpVelBase;
      this.timeSinceJump = 0;
      this.jumps++;
    }
  }

  walk(dir) {
    this.xVel += dir;
    this.facing = dir > 0 ? 1 : -1;
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
}
