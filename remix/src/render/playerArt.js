// Player rendering, extracted from the remake's Player.draw so the sim class
// stays Phaser-free. Squash & stretch and the face grid are render-only —
// collisions always use the true 30x30 box.

import {
  COLOR_PLAYER,
  COLOR_PLAYER_BORDER,
  COLOR_PLAYER_MOUTH,
  COLOR_SHIELD,
} from '../constants.js';

export function drawPlayer(gfx, p, tick, opts = {}) {
  // stretch tall while moving fast vertically, squash flat just after landing;
  // dash flattens wide, spike windup/plunge stretches tall
  let stretch;
  if (p.dashTimer > 0) {
    stretch = -0.35;
  } else if (p.spikeWindup > 0) {
    stretch = 0.4;
  } else if (p.spiking) {
    stretch = 0.3;
  } else if (p.landSquash > 0) {
    stretch = -0.16 * (p.landSquash / 8);
  } else if (p.offGround > 2) {
    stretch = Math.min(Math.abs(p.yVel) * 0.016, 0.2);
  } else {
    stretch = 0;
  }

  // ember glow at high Heat — the flow state is visible on the character
  if (p.heat >= 6 && !opts.ghost) {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const rr = 1.3 + 0.08 * Math.sin(tick * 0.3);
    gfx.fillStyle(p.heat >= 8 ? 0xffd700 : 0xff9f1c, 0.16);
    gfx.fillEllipse(cx, cy, p.w * rr * 1.6, p.h * rr * 1.6);
  }
  const w = p.w * (1 - stretch);
  const h = p.h * (1 + stretch);
  const x = p.x - (w - p.w) / 2; // keep centered horizontally
  const y = p.y + (p.h - h); // keep feet anchored

  const bodyAlpha = opts.alpha ?? 1;
  gfx.lineStyle(2, opts.border ?? COLOR_PLAYER_BORDER, bodyAlpha);
  gfx.fillStyle(opts.body ?? COLOR_PLAYER, bodyAlpha);
  gfx.fillRoundedRect(x, y, w, h, w / 6);
  gfx.strokeRoundedRect(x, y, w, h, w / 6);
  if (opts.ghost) return; // silhouette only (afterimages, best-run ghost)

  // face: 3 vertical states x 3 look directions (original costume grid)
  let eyeY, mouthY, mouthH, pupilDy;
  if (p.yVel > 0.5) {
    eyeY = 0.26;
    mouthY = 0.56;
    mouthH = 0.28; // surprised, mid-jump
    pupilDy = -1;
  } else if (p.yVel < -3.3) {
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
  if (p.xVel > 0.8) {
    eye1X = 0.34;
    eye2X = 0.76;
    mouthX = 0.42;
    pupilDx = 1;
  } else if (p.xVel < -0.8) {
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
  gfx.fillStyle(opts.mouth ?? COLOR_PLAYER_MOUTH);
  gfx.fillRoundedRect(x + w * mouthX, y + h * mouthY, w * 0.32, h * mouthH, 3);

  if (p.shieldTimer > 0) {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const r = 1.414 + 0.06 * Math.sin(tick * 0.2); // gentle pulse
    gfx.lineStyle(6, COLOR_SHIELD, 0.22);
    gfx.strokeEllipse(cx, cy, p.w * r * 1.15, p.h * r * 1.15);
    gfx.lineStyle(2.5, COLOR_SHIELD, 0.95);
    gfx.strokeEllipse(cx, cy, p.w * r, p.h * r);
  }
}
