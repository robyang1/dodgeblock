import {
  GRAVITY,
  GROUND,
  BLOCK_W,
  BLOCK_H,
  SPAWN_MIN_X,
  SPAWN_MAX_X,
  BLOCK_UPDATE_WINDOW,
  FAITHFUL_GROUND_BREAK,
  COLOR_BLOCK_FILLS,
  COLOR_BLOCK_BORDER,
  COLOR_BLOCK_TOP,
  COLOR_BLOCK_SHADE,
  COLOR_WARNING,
} from './constants.js';
import { rectrect, randomInt } from './utils.js';

export class Block {
  constructor(x, y, w, h, shade = 0) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.yVel = 0;
    this.fixed = false;
    this.idx = 0; // position in BlockManager.blocks, kept fresh on splice
    this.shade = shade; // cosmetic color variation
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
    this.onFix = null; // render-side hook (landing dust), no sim effect
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
      randomInt(0, COLOR_BLOCK_FILLS.length),
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
    if (this.onFix) this.onFix(b);
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
  const x = Math.round(b.x);
  const y = b.y;
  gfx.lineStyle(2, COLOR_BLOCK_BORDER);
  gfx.fillStyle(COLOR_BLOCK_FILLS[b.shade] ?? COLOR_BLOCK_FILLS[0]);
  gfx.fillRoundedRect(x, y, b.w, b.h, 6);
  gfx.strokeRoundedRect(x, y, b.w, b.h, 6);
  // bevel: light top edge, shaded bottom edge
  gfx.fillStyle(COLOR_BLOCK_TOP, 0.55);
  gfx.fillRoundedRect(x + 3, y + 3, b.w - 6, 8, { tl: 4, tr: 4, bl: 2, br: 2 });
  gfx.fillStyle(COLOR_BLOCK_SHADE, 0.35);
  gfx.fillRoundedRect(x + 3, y + b.h - 9, b.w - 6, 6, { tl: 2, tr: 2, bl: 4, br: 4 });
}

// Pulsing warning marker at the top of the screen for a falling block above
// view. `pulse` is 0..1.
export function drawWarningStrip(gfx, b, camY, pulse) {
  const x = Math.round(b.x);
  const cx = x + b.w / 2;
  gfx.fillStyle(COLOR_WARNING, 0.35 + 0.45 * pulse);
  gfx.fillRect(x, -camY, b.w, 5);
  gfx.fillStyle(COLOR_WARNING, 0.25 + 0.65 * pulse);
  gfx.fillTriangle(cx - 7, -camY + 5, cx + 7, -camY + 5, cx, -camY + 14);
}
