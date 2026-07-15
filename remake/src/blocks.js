import {
  GRAVITY,
  GROUND,
  BLOCK_W,
  BLOCK_H,
  SPAWN_MIN_X,
  SPAWN_MAX_X,
  SPAWN_GRID,
  BLOCK_UPDATE_WINDOW,
  FAITHFUL_GROUND_BREAK,
  COLOR_BLOCK_FILLS,
  COLOR_BLOCK_BORDER,
  COLOR_BLOCK_TOP,
  COLOR_BLOCK_SHADE,
  COLOR_WARNING,
  RES,
} from './constants.js';
import { rectrect, randomInt } from './utils.js';

// Block-on-block stacking test: strict in x (unlike the inclusive rectrect),
// so edge-touching neighbors don't count as support. On the SPAWN_GRID this
// guarantees every seated block overlaps its support by >= SPAWN_GRID px.
// Player and powerup collisions still use the faithful inclusive rectrect.
function stackContact(a, b) {
  return (
    a.x + a.w > b.x &&
    b.x + b.w > a.x &&
    ((a.y <= b.y && b.y <= a.y + a.h) || (b.y <= a.y && a.y <= b.y + b.h))
  );
}

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

  spawn(camY, blockRate) {
    // x snapped to the quarter-block grid (see SPAWN_GRID in constants.js);
    // spawn height creeps down as the rate rises — the original's
    // round(1000/fpb) offset, expressed in blocks/sec (1000/fpb = rate*50/3)
    const cells = Math.floor((SPAWN_MAX_X - SPAWN_MIN_X) / SPAWN_GRID) + 1;
    const b = new Block(
      SPAWN_MIN_X + SPAWN_GRID * randomInt(0, cells),
      -camY - 280 + (blockRate * 50) / 3,
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
          if (stackContact(b, layer[j])) {
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

// Draws one block's vector art at scale k with its top-left at (ox, oy).
// The body rect is inset by the stroke's half-width so a texture bake at
// exactly (BLOCK_W*k, BLOCK_H*k) doesn't clip the border.
function drawBlockArt(gfx, ox, oy, shade, k) {
  const w = BLOCK_W * k;
  const h = BLOCK_H * k;
  gfx.lineStyle(2 * k, COLOR_BLOCK_BORDER);
  gfx.fillStyle(COLOR_BLOCK_FILLS[shade] ?? COLOR_BLOCK_FILLS[0]);
  gfx.fillRoundedRect(ox + k, oy + k, w - 2 * k, h - 2 * k, 6 * k);
  gfx.strokeRoundedRect(ox + k, oy + k, w - 2 * k, h - 2 * k, 6 * k);
  // bevel: light top edge, shaded bottom edge
  gfx.fillStyle(COLOR_BLOCK_TOP, 0.55);
  gfx.fillRoundedRect(ox + 3 * k, oy + 3 * k, w - 6 * k, 8 * k, {
    tl: 4 * k, tr: 4 * k, bl: 2 * k, br: 2 * k,
  });
  gfx.fillStyle(COLOR_BLOCK_SHADE, 0.35);
  gfx.fillRoundedRect(ox + 3 * k, oy + h - 9 * k, w - 6 * k, 6 * k, {
    tl: 2 * k, tr: 2 * k, bl: 4 * k, br: 4 * k,
  });
}

// Immediate-mode vector draw, used by the menu's decorative blocks
export function drawBlock(gfx, b) {
  drawBlockArt(gfx, Math.round(b.x), b.y, b.shade ?? 0, 1);
}

// In-game blocks render as batched sprites instead: all shades are baked
// once into a single texture (one atlas -> one draw call for every block on
// screen), at RES density so they stay crisp under the camera zoom.
export const BLOCK_TEX = 'block-tiles';

export function bakeBlockTextures(scene) {
  if (scene.textures.exists(BLOCK_TEX)) return;
  const n = COLOR_BLOCK_FILLS.length;
  const g = scene.make.graphics({ add: false });
  for (let s = 0; s < n; s++) {
    drawBlockArt(g, s * BLOCK_W * RES, 0, s, RES);
  }
  g.generateTexture(BLOCK_TEX, n * BLOCK_W * RES, BLOCK_H * RES);
  g.destroy();
  const tex = scene.textures.get(BLOCK_TEX);
  for (let s = 0; s < n; s++) {
    tex.add('shade' + s, 0, s * BLOCK_W * RES, 0, BLOCK_W * RES, BLOCK_H * RES);
  }
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
