// Zone-aware backdrop: crossfading sky gradients plus per-zone atmosphere
// (parallax clouds, storm rain, stars, aurora ribbons). Gradients are only
// redrawn during a transition; per-frame work is a handful of primitives.

import { GAME_W, GAME_H } from '../constants.js';
import { ZONES } from '../zones.js';
import { drawSkyGradient, drawCloud, makeClouds } from './fx.js';

export class Background {
  constructor(scene) {
    this.scene = scene;
    this.zone = ZONES[0];
    this.gfxA = scene.add.graphics(); // settled gradient
    this.gfxB = scene.add.graphics().setAlpha(0); // incoming gradient
    this.starGfx = scene.add.graphics();
    this.auroraGfx = scene.add.graphics();
    this.cloudGfx = scene.add.graphics();
    this.rainGfx = scene.add.graphics();

    this.clouds = makeClouds(5);
    this.rain = Array.from({ length: 26 }, () => ({
      x: Math.random() * (GAME_W + 200),
      y: Math.random() * GAME_H,
      spd: 9 + Math.random() * 6,
      len: 10 + Math.random() * 12,
    }));
    this.stars = Array.from({ length: 70 }, () => ({
      x: Math.random() * GAME_W,
      y: Math.random() * GAME_H,
      r: 0.6 + Math.random() * 1.2,
      tw: Math.random() * Math.PI * 2,
    }));

    drawSkyGradient(this.gfxA, this.zone.skyTop, this.zone.skyBottom);
  }

  setZone(zone) {
    this.zone = zone;
    this.gfxB.clear();
    drawSkyGradient(this.gfxB, zone.skyTop, zone.skyBottom);
    this.scene.tweens.killTweensOf(this.gfxB);
    this.gfxB.setAlpha(0);
    this.scene.tweens.add({
      targets: this.gfxB,
      alpha: 1,
      duration: 2500,
      onComplete: () => {
        this.gfxA.clear();
        drawSkyGradient(this.gfxA, zone.skyTop, zone.skyBottom);
        this.gfxB.setAlpha(0);
      },
    });
  }

  update(tick, camY, rateMul) {
    const z = this.zone;

    // clouds: drift speed subtly tracks the director's intensity
    const cg = this.cloudGfx;
    cg.clear();
    if (z.cloudAlpha > 0.02) {
      const t = tick * (0.6 + rateMul * 0.6);
      for (const c of this.clouds) {
        const sx = ((((c.x + t * c.drift) % 1040) + 1040) % 1040) - 120;
        const sy = ((((c.y + camY * 0.15) % 560) + 560) % 560) - 30;
        drawCloud(cg, sx, sy, c.s, z.cloudAlpha);
      }
    }

    const rg = this.rainGfx;
    rg.clear();
    if (z.rain) {
      rg.lineStyle(1.5, 0xcfe0f5, 0.4);
      for (const d of this.rain) {
        d.y += d.spd;
        d.x -= 2;
        if (d.y > GAME_H + 20) {
          d.y = -20;
          d.x = Math.random() * (GAME_W + 200);
        }
        rg.lineBetween(d.x, d.y, d.x - 3, d.y - d.len);
      }
    }

    const sg = this.starGfx;
    sg.clear();
    if (z.stars) {
      // tiny quads, not circles — 70 fillCircles/frame is real tessellation
      for (const s of this.stars) {
        const a = 0.35 + 0.45 * Math.abs(Math.sin(tick * 0.02 + s.tw));
        sg.fillStyle(0xffffff, a);
        const y = ((s.y + camY * 0.05) % GAME_H + GAME_H) % GAME_H;
        sg.fillRect(s.x, y, s.r * 1.6, s.r * 1.6);
      }
    }

    const ag = this.auroraGfx;
    ag.clear();
    if (z.aurora) {
      for (let band = 0; band < 2; band++) {
        const baseY = 80 + band * 70;
        const color = band ? 0x64e8b0 : 0x8f7ff0;
        ag.lineStyle(14 - band * 4, color, 0.12);
        let prevX = -20;
        let prevY = baseY + Math.sin(tick * 0.01 + band) * 30;
        for (let x = 40; x <= GAME_W + 40; x += 60) {
          const y =
            baseY +
            Math.sin(x * 0.008 + tick * 0.012 + band * 2) * 34 +
            Math.sin(x * 0.02 - tick * 0.007) * 12;
          ag.lineBetween(prevX, prevY, x, y);
          prevX = x;
          prevY = y;
        }
      }
    }
  }
}
