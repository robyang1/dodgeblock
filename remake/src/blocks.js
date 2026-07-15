import {
  GRAVITY,
  GROUND,
  BLOCK_W,
  BLOCK_H,
  SPAWN_MIN_X,
  SPAWN_MAX_X,
  BLOCK_UPDATE_WINDOW,
  FAITHFUL_GROUND_BREAK,
  COLOR_BLOCK_FILL,
  COLOR_STROKE_GRAY,
} from './constants.js';
import { rectrect, randomInt } from './utils.js';

export class Block {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.yVel = 0;
    this.fixed = false;
    this.idx = 0; // position in BlockManager.blocks, kept fresh on splice
  }
}

export class BlockManager {
  constructor() {
    this.blocks = [];
    this.falling = []; // non-fixed blocks only, so sim cost is O(falling)
    // layers[L] holds blocks fixed at y = GROUND.y - BLOCK_H * L.
    // The original's `classes` table stored array indices, which the shield
    // splice silently corrupted; we store object references instead.
    this.layers = [[]];
  }

  get length() {
    return this.blocks.length;
  }

  spawn(camY, framesPerBlock) {
    const b = new Block(
      randomInt(SPAWN_MIN_X, SPAWN_MAX_X),
      -camY - 280 + Math.round(1000 / framesPerBlock),
      BLOCK_W,
      BLOCK_H,
    );
    b.idx = this.blocks.length;
    this.blocks.push(b);
    this.falling.push(b);
  }

  layerFor(L) {
    while (this.layers.length <= L) this.layers.push([]);
    return this.layers[L];
  }

  fixAt(b, L) {
    b.y = GROUND.y - b.h * L;
    b.fixed = true;
    b.yVel = 0;
    this.layerFor(L).push(b);
  }

  // One sim step of falling-block physics + stack-fixing, mirroring
  // classic/script.js:494-516. Iteration is in spawn order so a block that
  // fixes this step can catch a later block in the same step.
  update() {
    const windowLo = Math.max(this.blocks.length - BLOCK_UPDATE_WINDOW, 0);
    for (let i = 0; i < this.falling.length; i++) {
      const b = this.falling[i];
      // faithful: blocks outside the last-200 window are frozen mid-air
      if (b.idx < windowLo) continue;
      b.yVel += GRAVITY;
      b.y += b.yVel;
      // height layer this block currently overlaps; the original crashes on
      // c < 0 (classes[-1]) when a block outruns the stack late-game — we
      // clamp that to the ground case instead
      const c = Math.ceil((GROUND.y - b.y) / b.h) - 1;
      let fixed = false;
      if (c <= 0) {
        this.fixAt(b, 1);
        fixed = true;
      } else {
        const layer = this.layerFor(c);
        for (let j = 0; j < layer.length; j++) {
          if (rectrect(b, layer[j])) {
            this.fixAt(b, c + 1);
            fixed = true;
            break;
          }
        }
      }
      if (fixed) {
        this.falling.splice(i, 1);
        i--;
        // classic/script.js:504 `break` bug: a ground landing stalls every
        // other falling block for one step
        if (FAITHFUL_GROUND_BREAK && c <= 0) break;
      }
    }
  }

  // Shield consuming a falling block (the original's blocks.splice)
  remove(b) {
    const i = b.idx;
    this.blocks.splice(i, 1);
    for (let j = i; j < this.blocks.length; j++) this.blocks[j].idx = j;
    const f = this.falling.indexOf(b);
    if (f !== -1) this.falling.splice(f, 1);
  }
}

export function drawBlock(gfx, b) {
  gfx.lineStyle(Math.round(b.w / 30), COLOR_STROKE_GRAY);
  gfx.fillStyle(COLOR_BLOCK_FILL);
  gfx.fillRoundedRect(Math.round(b.x), b.y, b.w, b.h, b.w / 10);
  gfx.strokeRoundedRect(Math.round(b.x), b.y, b.w, b.h, b.w / 10);
}

// Red warning strip at the top of the screen for a falling block above view
export function drawWarningStrip(gfx, b, camY) {
  gfx.fillStyle(0xff0000);
  gfx.fillRect(Math.round(b.x), -camY, b.w, 5);
}
