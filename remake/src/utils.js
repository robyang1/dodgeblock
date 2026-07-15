import { GAME_W, GAME_H, RES, FONT } from './constants.js';

// Ported verbatim from classic/script.js:35 — the comparisons are inclusive
// (<=), so rects that merely touch count as overlapping. The physics
// (landing snaps, ceiling push-out) depends on this; do not "fix" it.
export function rectrect(rect1, rect2) {
  return (
    ((rect1.x <= rect2.x && rect2.x <= rect1.x + rect1.w) ||
      (rect2.x <= rect1.x && rect1.x <= rect2.x + rect2.w)) &&
    ((rect1.y <= rect2.y && rect2.y <= rect1.y + rect1.h) ||
      (rect2.y <= rect1.y && rect1.y <= rect2.y + rect2.h))
  );
}

export function constrain(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

// p5's random(min, max) floored, as the original spawn code does
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

// Zoom the scene camera so game code works in 800x500 coordinates while the
// canvas renders at RES times that (see RES in constants.js).
export function setupCamera(scene, bgColor) {
  const cam = scene.cameras.main;
  cam.setBackgroundColor(bgColor);
  cam.setZoom(RES);
  cam.centerOn(GAME_W / 2, GAME_H / 2);
}

// Shared text style; `resolution` makes Phaser rasterize the glyphs at canvas
// density — without it text stays blurry even on a high-res canvas.
export function textStyle(size, extra = {}) {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color: '#000',
    resolution: RES,
    ...extra,
  };
}
