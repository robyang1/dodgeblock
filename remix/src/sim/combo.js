// Graze detection and the Heat/Spark economy.
//
// Grazes are the only renewable Spark source, so the panic buttons (dash,
// spike drop) are earned by having played dangerously in the preceding
// seconds. Heat is the unified flow meter: it buffs movement, multiplies
// score, and drives the music. All state lives on sim/player; this module is
// just the rules.

import {
  SPAWN_MIN_X,
  SPAWN_GRID,
  GRAZE_PAD,
  GRAZE_PERFECT_GAP,
  GRAZE_LETHAL_VEL,
  GRAZE_COLUMN_COOLDOWN,
  BLOCK_COLLIDE_WINDOW,
  HEAT_MAX,
  HEAT_DECAY_FRAMES,
  HEAT_T1,
  HEAT_T2,
  HEAT_T3,
} from '../constants.js';
import { rectrect } from './util.js';

export function heatTier(heat) {
  return heat >= HEAT_T3 ? 3 : heat >= HEAT_T2 ? 2 : heat >= HEAT_T1 ? 1 : 0;
}

// score multiplier by tier: x1 / x2 / x3 / x4
export function heatMult(heat) {
  return 1 + heatTier(heat);
}

export function gainHeat(sim, n, reason) {
  const p = sim.player;
  const before = heatTier(p.heat);
  p.heat = Math.min(HEAT_MAX, p.heat + n);
  p.heatIdle = 0;
  sim.events.emit('heat', { heat: p.heat, gain: n, reason });
  const after = heatTier(p.heat);
  if (after !== before) sim.events.emit('heatTier', { tier: after, up: true });
}

export function loseHeat(sim, n, reason) {
  const p = sim.player;
  const before = heatTier(p.heat);
  p.heat = Math.max(0, p.heat - n);
  sim.events.emit('heatLoss', { heat: p.heat, reason });
  const after = heatTier(p.heat);
  if (after !== before) sim.events.emit('heatTier', { tier: after, up: false });
}

export function updateHeatDecay(sim) {
  const p = sim.player;
  p.heatIdle++;
  if (p.heatIdle >= HEAT_DECAY_FRAMES && p.heat > 0) {
    p.heatIdle = 0;
    loseHeat(sim, 1, 'decay');
  }
}

export function gainSpark(sim, n, reason) {
  const p = sim.player;
  const got = Math.min(p.sparkCap, p.sparks + n) - p.sparks;
  if (got <= 0) return 0;
  p.sparks += got;
  sim.events.emit('spark', { sparks: p.sparks, gain: got, reason });
  return got;
}

// Chebyshev gap between two AABBs (0 when overlapping) — deterministic,
// unlike hypot which isn't correctly-rounded across engines.
function aabbGap(a, b) {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.max(dx, dy);
}

// Called once per step after the collision passes (player at final position).
// A lethal falling block passing within GRAZE_PAD of the player pays a Spark
// + Heat, once per block; shaving it to <= GRAZE_PERFECT_GAP at any frame
// while it falls upgrades to a perfect graze (once). Grazes from the same
// spawn column within GRAZE_COLUMN_COOLDOWN frames pay nothing — no farming
// a stack that's landing beside you.
export function updateGraze(sim) {
  const p = sim.player;
  if (p.dashTimer > 0 || p.spiking) return; // dashing through is the phase bonus
  const falling = sim.blocks.falling;
  const windowLo = Math.max(0, sim.blocks.blocks.length - BLOCK_COLLIDE_WINDOW);
  for (let i = 0; i < falling.length; i++) {
    const b = falling[i];
    if (b.idx < windowLo) continue;
    if (b === sim.landedOn || b === sim.surfBlock) continue; // riding ≠ grazing
    if (b.yVel <= GRAZE_LETHAL_VEL) continue;
    if (b.grazed && b.grazePerfect) continue;
    const inflated = {
      x: b.x - GRAZE_PAD,
      y: b.y - GRAZE_PAD,
      w: b.w + GRAZE_PAD * 2,
      h: b.h + GRAZE_PAD * 2,
    };
    if (!rectrect(p, inflated) || rectrect(p, b)) continue;
    const gap = aabbGap(p, b);
    const col = Math.round((b.x - SPAWN_MIN_X) / SPAWN_GRID);
    if (!b.grazed) {
      b.grazed = true;
      const last = sim.lastGrazeByCol.get(col);
      const paid = !(last !== undefined && sim.frame - last < GRAZE_COLUMN_COOLDOWN);
      sim.lastGrazeByCol.set(col, sim.frame);
      if (paid) {
        gainSpark(sim, 1, 'graze');
        gainHeat(sim, 1, 'graze');
      }
      sim.events.emit('graze', {
        x: b.x + b.w / 2,
        y: b.y + b.h / 2,
        px: p.x + p.w / 2,
        py: p.y + p.h / 2,
        perfect: false,
        paid,
        gilded: b.type === 'gilded',
      });
      if (paid && b.type === 'gilded') gainSpark(sim, 1, 'gilded-graze');
    }
    if (b.grazed && !b.grazePerfect && gap <= GRAZE_PERFECT_GAP) {
      b.grazePerfect = true;
      gainSpark(sim, 1, 'perfect');
      gainHeat(sim, 1, 'perfect');
      sim.events.emit('graze', {
        x: b.x + b.w / 2,
        y: b.y + b.h / 2,
        px: p.x + p.w / 2,
        py: p.y + p.h / 2,
        perfect: true,
        paid: true,
        gilded: b.type === 'gilded',
      });
    }
  }
}
