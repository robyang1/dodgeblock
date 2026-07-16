// Render-side block art: per-type vector art, the baked sprite atlas, and
// the warning strip. Sim code never imports this file.

import {
  BLOCK_W,
  BLOCK_H,
  COLOR_BLOCK_FILLS,
  COLOR_BLOCK_BORDER,
  COLOR_BLOCK_TOP,
  COLOR_BLOCK_SHADE,
  COLOR_WARNING,
  RES,
} from '../constants.js';
import { BLOCK_TYPES } from '../sim/blockTypes.js';

// Art definition per block type id. `fills` length must be >= the sim spec's
// `variants`. Types added later (gilded, ember, ...) get a row here.
export const BLOCK_ART = {
  wood: {
    fills: COLOR_BLOCK_FILLS,
    border: COLOR_BLOCK_BORDER,
    top: COLOR_BLOCK_TOP,
    shade: COLOR_BLOCK_SHADE,
  },
  gilded: {
    fills: [0xffd700],
    border: 0xb8860b,
    top: 0xfff3b0,
    shade: 0xc79810,
  },
  monolith: {
    fills: [0x2b2b36],
    border: 0x0f0f16,
    top: 0x4d4d5e,
    shade: 0x08080d,
  },
};

// Draws one block's vector art at scale k with its top-left at (ox, oy).
// The body rect is inset by the stroke's half-width so a texture bake at
// exactly (BLOCK_W*k, BLOCK_H*k) doesn't clip the border.
function drawBlockArt(gfx, ox, oy, art, variant, k) {
  const w = BLOCK_W * k;
  const h = BLOCK_H * k;
  gfx.lineStyle(2 * k, art.border);
  gfx.fillStyle(art.fills[variant] ?? art.fills[0]);
  gfx.fillRoundedRect(ox + k, oy + k, w - 2 * k, h - 2 * k, 6 * k);
  gfx.strokeRoundedRect(ox + k, oy + k, w - 2 * k, h - 2 * k, 6 * k);
  // bevel: light top edge, shaded bottom edge
  gfx.fillStyle(art.top, 0.55);
  gfx.fillRoundedRect(ox + 3 * k, oy + 3 * k, w - 6 * k, 8 * k, {
    tl: 4 * k, tr: 4 * k, bl: 2 * k, br: 2 * k,
  });
  gfx.fillStyle(art.shade, 0.35);
  gfx.fillRoundedRect(ox + 3 * k, oy + h - 9 * k, w - 6 * k, 6 * k, {
    tl: 2 * k, tr: 2 * k, bl: 4 * k, br: 4 * k,
  });
}

// Immediate-mode vector draw, used by the menu's decorative blocks
export function drawBlock(gfx, b) {
  drawBlockArt(gfx, Math.round(b.x), b.y, BLOCK_ART.wood, b.shade ?? 0, 1);
}

// In-game blocks render as batched sprites: every type x variant is baked
// once into a single texture (one atlas -> one draw call for every block on
// screen), at RES density so they stay crisp under the camera zoom.
// Grid layout: one row per type, one column per variant. Frame key
// `${type}/${variant}` — see frameNameFor().
export const BLOCK_TEX = 'block-tiles';

export function frameNameFor(b) {
  const v = b.spec.frameFor ? b.spec.frameFor(b) : b.shade;
  return b.type + '/' + v;
}

export function bakeBlockTextures(scene) {
  if (scene.textures.exists(BLOCK_TEX)) return;
  const types = [...BLOCK_TYPES.values()];
  let cols = 0;
  for (const spec of types) cols = Math.max(cols, spec.variants);

  const fw = BLOCK_W * RES;
  const fh = BLOCK_H * RES;
  // one texture keeps the whole stack a single batched draw call — if the
  // type/variant count ever overflows a safe texture size, shrink RES
  // rather than splitting the atlas
  if (cols * fw > 4096 || types.length * fh > 4096) {
    throw new Error('block atlas exceeds 4096px — reduce RES or variants');
  }

  const g = scene.make.graphics({ add: false });
  for (let row = 0; row < types.length; row++) {
    const art = BLOCK_ART[types[row].id] ?? BLOCK_ART.wood;
    for (let v = 0; v < types[row].variants; v++) {
      drawBlockArt(g, v * fw, row * fh, art, v, RES);
    }
  }
  g.generateTexture(BLOCK_TEX, cols * fw, types.length * fh);
  g.destroy();
  const tex = scene.textures.get(BLOCK_TEX);
  for (let row = 0; row < types.length; row++) {
    for (let v = 0; v < types[row].variants; v++) {
      tex.add(types[row].id + '/' + v, 0, v * fw, row * fh, fw, fh);
    }
  }
}

// Pulsing warning marker at the top of the screen for a falling block above
// view. `pulse` is 0..1.
export function drawWarningStrip(gfx, b, camY, pulse, color = COLOR_WARNING) {
  const x = Math.round(b.x);
  const cx = x + b.w / 2;
  gfx.fillStyle(color, 0.35 + 0.45 * pulse);
  gfx.fillRect(x, -camY, b.w, 5);
  gfx.fillStyle(color, 0.25 + 0.65 * pulse);
  gfx.fillTriangle(cx - 7, -camY + 5, cx + 7, -camY + 5, cx, -camY + 14);
}
